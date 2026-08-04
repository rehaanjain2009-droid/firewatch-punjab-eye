// Reverse geocoding via OpenStreetMap Nominatim.
// Nominatim's usage policy allows max 1 request/second, so requests are
// serialized with a delay and cached for 24h.

export type GeoInfo = {
  id: string;
  label: string; // human readable: "Farmland near Ludhiana"
  landUse: string; // raw type/class tag, e.g. "farmland", "residential"
  urban: boolean; // true => suppress as false positive
  ok: boolean; // false => lookup failed (safe KEEP)
};

const URBAN_TAGS = new Set([
  "city",
  "town",
  "residential",
  "commercial",
  "industrial",
  "suburb",
  "neighbourhood",
  "quarter",
  "retail",
  "city_block",
  "borough",
]);

const RURAL_HINT_TAGS = new Set([
  "farmland",
  "farmyard",
  "village",
  "hamlet",
  "county",
  "state",
  "state_district",
  "administrative",
  "orchard",
  "meadow",
  "forest",
]);

type NominatimResponse = {
  display_name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
  error?: string;
};

type CacheEntry = { info: Omit<GeoInfo, "id">; ts: number };
const TTL_MS = 24 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();

const RATE_MS = 1100;
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key(lat: number, lng: number) {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

function evaluate(json: NominatimResponse): Omit<GeoInfo, "id"> {
  const addr = json.address ?? {};
  const type = (json.type ?? "").toLowerCase();
  const klass = (json.class ?? "").toLowerCase();

  // Urban if the response type is urban, or the address resolves to a
  // city/town/suburb without any rural landuse indicator.
  const addrUrban = Boolean(addr["city"] || addr["town"] || addr["suburb"] || addr["neighbourhood"]);
  const addrRural = Boolean(addr["village"] || addr["hamlet"] || addr["farm"] || addr["farmland"]);

  const typeUrban = URBAN_TAGS.has(type);
  const typeRural = RURAL_HINT_TAGS.has(type) || klass === "landuse" || klass === "natural";

  const urban = typeUrban || (addrUrban && !addrRural && !typeRural);

  const place =
    addr["village"] ||
    addr["hamlet"] ||
    addr["town"] ||
    addr["city"] ||
    addr["suburb"] ||
    addr["county"] ||
    addr["state_district"] ||
    addr["state"] ||
    "";

  const landUse = type || klass || (addrUrban ? "urban" : "unclassified");
  const pretty = landUse.replace(/_/g, " ");
  const label = place ? `${pretty} near ${place}` : pretty;

  return { label, landUse, urban, ok: true };
}

async function lookupOne(lat: number, lng: number): Promise<Omit<GeoInfo, "id">> {
  const wait = RATE_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PPF-Stubble-Fire-Dashboard/1.0 (dispatch monitoring)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { label: "lookup unavailable", landUse: "unknown", urban: false, ok: false };
    const json = (await res.json()) as NominatimResponse;
    if (json.error) return { label: "lookup unavailable", landUse: "unknown", urban: false, ok: false };
    return evaluate(json);
  } catch {
    return { label: "lookup unavailable", landUse: "unknown", urban: false, ok: false };
  }
}

export type GeoInput = { id: string; lat: number; lng: number };

export async function reverseGeocodePoints(points: GeoInput[]): Promise<GeoInfo[]> {
  const now = Date.now();
  const out: GeoInfo[] = [];

  for (const p of points) {
    const k = key(p.lat, p.lng);
    const hit = cache.get(k);
    if (hit && now - hit.ts < TTL_MS) {
      out.push({ id: p.id, ...hit.info });
      continue;
    }
    const info = await lookupOne(p.lat, p.lng);
    if (info.ok) cache.set(k, { info, ts: Date.now() });
    out.push({ id: p.id, ...info });
  }

  return out;
}
