/**
 * OpenStreetMap Overpass API — exact built-up / industrial polygons.
 * Fetches ONLY: landuse=industrial, man_made=kiln and industrial=brick_kiln.
 * Residential/commercial (which also covers rural villages), farmland and
 * forest are never fetched, so farm fires are never masked.
 */
import { classifyOsmTags, type IndustrialFeature, type Ring } from "./landuseMask";

export type { IndustrialFeature, Ring } from "./landuseMask";

type CacheEntry = { ts: number; features: IndustrialFeature[] };
const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ ok: boolean; reason?: string; features: IndustrialFeature[] }>>();

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const QUERY_VERSION = "5"; // bump when the Overpass query changes to invalidate cached masks
// Kilns mapped as a single point get a small square footprint (~120 m half-width).
const KILN_NODE_HALF_DEG = 0.0011;

function buildQuery(south: number, west: number, north: number, east: number) {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:120];
(
  way["landuse"="industrial"](${bbox});
  relation["landuse"="industrial"](${bbox});
  nwr["man_made"="kiln"](${bbox});
  nwr["industrial"="brick_kiln"](${bbox});
);
out geom qt;`;
}

type OverpassEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function ringFrom(geom?: { lat: number; lon: number }[]): Ring | null {
  if (!geom || geom.length < 4) return null;
  const ring: Ring = geom.map((p) => [r5(p.lon), r5(p.lat)]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (ring.length < 4) return null;
  return ring;
}

function squareAround(lat: number, lon: number): Ring {
  const d = KILN_NODE_HALF_DEG;
  return [
    [r5(lon - d), r5(lat - d)],
    [r5(lon + d), r5(lat - d)],
    [r5(lon + d), r5(lat + d)],
    [r5(lon - d), r5(lat + d)],
    [r5(lon - d), r5(lat - d)],
  ];
}

async function doFetch(south: number, west: number, north: number, east: number) {
  const body = new URLSearchParams({ data: buildQuery(south, west, north, east) });
  let lastReason = "unreachable";

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "PPF-StubbleWatch/1.0 (dispatch monitoring)",
        },
        body,
      });
      if (!res.ok) {
        lastReason = `HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassEl[] };
      const features: IndustrialFeature[] = [];
      for (const el of json.elements ?? []) {
        const tags = el.tags ?? {};
        const kind = classifyOsmTags(tags);
        if (!kind) continue;
        const name = tags["name"] ?? (kind === "brick_kiln" ? "Brick kiln" : "Unnamed site");
        if (el.type === "node") {
          if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
            features.push({ id: `n${el.id}`, name, landuse: kind, ring: squareAround(el.lat!, el.lon!) });
          }
        } else if (el.type === "way") {
          const ring = ringFrom(el.geometry);
          if (ring) features.push({ id: `w${el.id}`, name, landuse: kind, ring });
        } else if (el.type === "relation") {
          let i = 0;
          for (const m of el.members ?? []) {
            if (m.role && m.role !== "outer") continue;
            const ring = ringFrom(m.geometry);
            if (ring) features.push({ id: `r${el.id}-${i++}`, name, landuse: kind, ring });
          }
        }
      }
      return { ok: true, features };
    } catch (e) {
      lastReason = e instanceof Error ? e.message : "fetch failed";
    }
  }
  return { ok: false, reason: lastReason, features: [] as IndustrialFeature[] };
}

export async function fetchIndustrialAreas(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<{ ok: boolean; reason?: string; features: IndustrialFeature[] }> {
  const key = [QUERY_VERSION, south, west, north, east].map((n) => String(n)).join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return { ok: true, features: hit.features };

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = doFetch(south, west, north, east)
    .then((r) => {
      if (r.ok) cache.set(key, { ts: Date.now(), features: r.features });
      return r;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
