import { createFileRoute } from "@tanstack/react-router";
import { fetchActiveFires } from "@/lib/gee.server";
import { isDispatched, markDispatched, pruneDedup, sendTelegram } from "@/lib/telegram.server";

const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Karimnagar", lat: 18.4386, lng: 79.1288 },
  { name: "Huzurabad", lat: 18.1933, lng: 79.4042 },
  { name: "Jammikunta", lat: 18.2789, lng: 79.4736 },
  { name: "Husnabad", lat: 18.1351, lng: 79.5154 },
  { name: "Sircilla", lat: 18.3878, lng: 78.8106 },
  { name: "Peddapalli", lat: 18.6147, lng: 79.3744 },
  { name: "Warangal", lat: 17.9784, lng: 79.6004 },
  { name: "Hanamkonda", lat: 18.0079, lng: 79.5685 },
  { name: "Siddipet", lat: 18.1018, lng: 78.8520 },
  { name: "Jagtial", lat: 18.7895, lng: 78.9120 },
  { name: "Mancherial", lat: 18.8714, lng: 79.4441 },
  { name: "Nizamabad", lat: 18.6725, lng: 78.0941 },
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { name: "Khammam", lat: 17.2473, lng: 80.1514 },
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
