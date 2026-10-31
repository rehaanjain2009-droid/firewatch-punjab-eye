import { createFileRoute } from "@tanstack/react-router";
import { fetchActiveFires } from "@/lib/gee.server";
import { isDispatched, markDispatched, pruneDedup, sendTelegram } from "@/lib/telegram.server";
import { fetchIndustrialAreas } from "@/lib/overpass.server";
import { loadWardCollection, computeWardMask } from "@/lib/wardMask";
import {
  computeLanduseMask,
  DISPATCH_MIN_CONFIDENCE,
  OSM_MASK_BBOX,
  shouldAutoDispatch,
} from "@/lib/landuseMask";

const MAX_PER_RUN = 10;

export const Route = createFileRoute("/api/public/cron-dispatch")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const ok = !!cronSecret && !!provided && provided === cronSecret;
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  pruneDedup();
  const data = await fetchActiveFires(1);
  if (!data) {
    return Response.json({ ok: false, error: "FIRMS_MAP_KEY not configured" }, { status: 500 });
  }

  // Step 2 — Suppress ONLY fires inside the MC Ludhiana ward core or an exact
  // OSM industrial / brick-kiln / commercial / residential polygon.
  const [wards, osm] = await Promise.all([
    loadWardCollection(),
    fetchIndustrialAreas(OSM_MASK_BBOX.south, OSM_MASK_BBOX.west, OSM_MASK_BBOX.north, OSM_MASK_BBOX.east),
  ]);
  const wardMask = computeWardMask(data.fires, wards);
  const osmMask = computeLanduseMask(data.fires, osm.features);

  const agricultural: typeof data.fires = [];
  let suppressedUrban = 0;
  for (const f of data.fires) {
    if (wardMask.suppressedIds.has(f.id) || osmMask.suppressedIds.has(f.id)) {
      suppressedUrban++;
      continue;
    }
    agricultural.push(f);
  }

  const candidates = agricultural
    .filter((f) => shouldAutoDispatch(f.confidence) && !isDispatched(f))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PER_RUN);

  const results: { lat: number; lng: number; confidence: number; ok: boolean; status: number }[] = [];
  for (const f of candidates) {
    const r = await sendTelegram({
      block: nearestBlock(f.lat, f.lng),
      lat: f.lat,
      lng: f.lng,
      confidence: f.confidence,
      frp: f.frp,
      acqDate: f.acqDate,
      acqTime: f.acqTime,
      satellite: f.satellite,
    });
    if (r.ok) markDispatched(f);
    results.push({ lat: f.lat, lng: f.lng, confidence: f.confidence, ok: r.ok, status: r.status });
  }

  return Response.json({
    ok: true,
    scanned: data.fires.length,
    suppressedUrban,
    wardPolygons: wards.features.length,
    osmPolygons: osm.features.length,
    osmMaskOk: osm.ok,
    agricultural: agricultural.length,
    source: data.source,
    threshold: `>= ${DISPATCH_MIN_CONFIDENCE}%`,
    dispatched: results.filter((r) => r.ok).length,
    results,
  });
}

const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
  { name: "Jalandhar", lat: 31.3260, lng: 75.5762 },
  { name: "Khanna", lat: 30.7040, lng: 76.2176 },
  { name: "Moga", lat: 30.8160, lng: 75.1720 },
  { name: "Sangrur", lat: 30.2430, lng: 75.8400 },
  { name: "Patiala", lat: 30.3398, lng: 76.3869 },
  { name: "Amritsar", lat: 31.6340, lng: 74.8723 },
  { name: "Bathinda", lat: 30.2110, lng: 74.9455 },
  { name: "Ferozepur", lat: 30.9330, lng: 74.6160 },
  { name: "Barnala", lat: 30.3700, lng: 75.5500 },
  { name: "Fazilka", lat: 30.4040, lng: 74.0280 },
  { name: "Hoshiarpur", lat: 31.5200, lng: 75.9800 },
  { name: "Kapurthala", lat: 31.3800, lng: 75.3800 },
  { name: "Rupnagar", lat: 30.9700, lng: 76.5300 },
  { name: "Nawanshahr", lat: 31.1200, lng: 76.1300 },
];

function nearestBlock(lat: number, lng: number): string {
  let best = BLOCKS[0];
  let bestD = Infinity;
  for (const b of BLOCKS) {
    const d = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best.name;
}
