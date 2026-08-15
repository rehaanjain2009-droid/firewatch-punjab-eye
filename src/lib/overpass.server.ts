/**
 * OpenStreetMap Overpass API — real urban footprint boundaries.
 * Used as the "Urban & Industrial Exclusion" mask replacing the old Turf circle.
 * Fetches industrial, commercial, residential, retail, construction, brownfield,
 * quarry, landfill, and military landuse so the entire city sprawl is masked.
 */

export type Ring = [number, number][]; // [lng, lat]
export type IndustrialFeature = {
  id: string;
  name: string;
  landuse: string;
  ring: Ring;
};

type CacheEntry = { ts: number; features: IndustrialFeature[] };
const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const LANDUSE = "industrial|commercial|retail|residential|construction|brownfield|quarry|landfill|military";

function buildQuery(south: number, west: number, north: number, east: number) {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:40];
(
  way["landuse"~"${LANDUSE}"](${bbox});
  relation["landuse"~"${LANDUSE}"](${bbox});
  way["man_made"="works"](${bbox});
);
out geom 400;`;
}

type OverpassEl = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
};

function ringFrom(geom?: { lat: number; lon: number }[]): Ring | null {
  if (!geom || geom.length < 4) return null;
  const ring: Ring = geom.map((p) => [p.lon, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (ring.length < 4) return null;
  return ring;
}

export async function fetchIndustrialAreas(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<{ ok: boolean; reason?: string; features: IndustrialFeature[] }> {
  const key = [south, west, north, east].map((n) => n.toFixed(2)).join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return { ok: true, features: hit.features };
  }

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
        const landuse = tags["landuse"] ?? tags["man_made"] ?? "industrial";
        if (el.type === "way") {
          const ring = ringFrom(el.geometry);
          if (ring) {
            features.push({
              id: `w${el.id}`,
              name: tags["name"] ?? "Unnamed site",
              landuse,
              ring,
            });
          }
        } else if (el.type === "relation") {
          let i = 0;
          for (const m of el.members ?? []) {
            if (m.role && m.role !== "outer") continue;
            const ring = ringFrom(m.geometry);
            if (ring) {
              features.push({
                id: `r${el.id}-${i++}`,
                name: tags["name"] ?? "Unnamed site",
                landuse,
                ring,
              });
            }
          }
        }
      }
      cache.set(key, { ts: Date.now(), features });
      return { ok: true, features };
    } catch (e) {
      lastReason = e instanceof Error ? e.message : "fetch failed";
    }
  }

  return { ok: false, reason: lastReason, features: [] };
}
