import { createFileRoute } from "@tanstack/react-router";
import { fetchActiveFires } from "@/lib/gee.server";
import { isDispatched, markDispatched, pruneDedup, sendTelegram } from "@/lib/telegram.server";

const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Jagraon", lat: 30.7892, lng: 75.4731 },
  { name: "Sidhwan Bet", lat: 30.9118, lng: 75.574 },
  { name: "Mullanpur Dakha", lat: 30.8642, lng: 75.6711 },
  { name: "Raikot", lat: 30.6491, lng: 75.6055 },
  { name: "Samrala", lat: 30.8348, lng: 76.1929 },
  { name: "Khanna", lat: 30.7038, lng: 76.2215 },
  { name: "Payal", lat: 30.6996, lng: 76.0518 },
  { name: "Ludhiana", lat: 30.901, lng: 75.8573 },
  { name: "Moga", lat: 30.816, lng: 75.17 },
  { name: "Barnala", lat: 30.3782, lng: 75.546 },
  { name: "Patiala", lat: 30.3398, lng: 76.3869 },
  { name: "Sangrur", lat: 30.2458, lng: 75.8421 },
  { name: "Bathinda", lat: 30.211, lng: 74.9455 },
  { name: "Amritsar", lat: 31.634, lng: 74.8723 },
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

const MIN_CONFIDENCE = 70;
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
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("x-cron-secret") ??
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const ok =
    (!!cronSecret && provided === cronSecret) ||
    (!!anonKey && provided === anonKey);
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

  const candidates = data.fires
    .filter((f) => f.confidence >= MIN_CONFIDENCE && !isDispatched(f))
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
    source: data.source,
    threshold: MIN_CONFIDENCE,
    dispatched: results.filter((r) => r.ok).length,
    results,
  });
}
