import { getAccessToken, getProjectId } from "./gee.server";

// ESA WorldCover v200 class codes:
//  10 trees, 20 shrub, 30 grassland, 40 cropland, 50 built-up, 60 bare,
//  70 snow/ice, 80 water, 90 wetland, 95 mangrove, 100 moss/lichen
export type LcCode = number;

export function isCropland(code: LcCode | null | undefined): boolean {
  return code === 40;
}

type CacheEntry = { code: LcCode | null; ts: number };
const TTL_MS = 24 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(4)}|${lng.toFixed(4)}`;
}

function pointExpression(lat: number, lng: number) {
  return {
    expression: {
      result: "out",
      values: {
        out: {
          functionInvocationValue: {
            functionName: "Dictionary.get",
            arguments: {
              dictionary: {
                functionInvocationValue: {
                  functionName: "Image.reduceRegion",
                  arguments: {
                    image: {
                      functionInvocationValue: {
                        functionName: "ImageCollection.first",
                        arguments: {
                          collection: {
                            functionInvocationValue: {
                              functionName: "ImageCollection.load",
                              arguments: { id: { constantValue: "ESA/WorldCover/v200" } },
                            },
                          },
                        },
                      },
                    },
                    reducer: {
                      functionInvocationValue: { functionName: "Reducer.first", arguments: {} },
                    },
                    geometry: {
                      functionInvocationValue: {
                        functionName: "GeometryConstructors.Point",
                        arguments: { coordinates: { constantValue: [lng, lat] } },
                      },
                    },
                    scale: { constantValue: 10 },
                  },
                },
              },
              key: { constantValue: "Map" },
            },
          },
        },
      },
    },
  };
}

async function sampleOne(
  lat: number,
  lng: number,
  token: string,
  project: string,
): Promise<LcCode | null> {
  const url = `https://earthengine.googleapis.com/v1/projects/${project}/value:compute`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(pointExpression(lat, lng)),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: unknown };
  const v = json.result;
  if (typeof v === "number") return v;
  return null;
}

export type ClassifyInput = { id: string; lat: number; lng: number };
export type ClassifyResult = {
  ok: boolean;
  reason?: string;
  classifications: { id: string; landCover: LcCode | null }[];
};

export async function classifyPoints(points: ClassifyInput[]): Promise<ClassifyResult> {
  const token = await getAccessToken();
  const project = getProjectId();
  if (!token || !project) {
    return { ok: false, reason: "GEE unavailable", classifications: [] };
  }

  const now = Date.now();
  const out: { id: string; landCover: LcCode | null }[] = [];
  const toFetch: ClassifyInput[] = [];

  for (const p of points) {
    const hit = cache.get(cacheKey(p.lat, p.lng));
    if (hit && now - hit.ts < TTL_MS) {
      out.push({ id: p.id, landCover: hit.code });
    } else {
      toFetch.push(p);
    }
  }

  // Fetch in parallel chunks to avoid hammering EE.
  const CHUNK = 8;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const slice = toFetch.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((p) => sampleOne(p.lat, p.lng, token, project).then((code) => ({ p, code }))),
    );
    for (const { p, code } of results) {
      cache.set(cacheKey(p.lat, p.lng), { code, ts: now });
      out.push({ id: p.id, landCover: code });
    }
  }

  return { ok: true, classifications: out };
}
