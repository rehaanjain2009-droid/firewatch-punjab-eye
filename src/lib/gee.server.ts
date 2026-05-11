import { SignJWT, importPKCS8 } from "jose";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
};

let cachedToken: { token: string; exp: number } | null = null;
let cachedSA: ServiceAccount | null = null;

function loadSA(): ServiceAccount | null {
  if (cachedSA) return cachedSA;
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    cachedSA = JSON.parse(raw) as ServiceAccount;
    return cachedSA;
  } catch (e) {
    console.error("GEE_SERVICE_ACCOUNT_JSON is not valid JSON", e);
    return null;
  }
}

export function getProjectId(): string | null {
  return process.env.GEE_PROJECT_ID ?? loadSA()?.project_id ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  const sa = loadSA();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/earthengine.readonly https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience(sa.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setSubject(sa.client_email)
    .sign(key);

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    console.error("GEE token exchange failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + data.expires_in };
  return cachedToken.token;
}

const PUNJAB_BBOX = [73.9, 29.5, 76.9, 32.5] as const;

export type FirePoint = {
  id: string;
  lat: number;
  lng: number;
  confidence: number;
  acqTime: string;
};

let cachedFires: { ts: number; data: FirePoint[] } | null = null;

export async function fetchActiveFires(hours = 24): Promise<FirePoint[] | null> {
  const token = await getAccessToken();
  const project = getProjectId();
  if (!token || !project) return null;

  if (cachedFires && Date.now() - cachedFires.ts < 5 * 60_000) return cachedFires.data;

  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);

  // Build EE expression: FIRMS filtered by date+bbox, intersected with ESA cropland (class 40)
  const expression = {
    expression: {
      result: "0",
      values: {
        "0": {
          functionInvocationValue: {
            functionName: "Collection.toList",
            arguments: {
              collection: {
                functionInvocationValue: {
                  functionName: "Collection.filter",
                  arguments: {
                    collection: {
                      functionInvocationValue: {
                        functionName: "Collection.loadTable",
                        arguments: { tableId: { constantValue: "FIRMS" } },
                      },
                    },
                    filter: {
                      functionInvocationValue: {
                        functionName: "Filter.and",
                        arguments: {
                          filters: {
                            arrayValue: {
                              values: [
                                {
                                  functionInvocationValue: {
                                    functionName: "Filter.dateRangeContains",
                                    arguments: {
                                      leftValue: {
                                        functionInvocationValue: {
                                          functionName: "DateRange",
                                          arguments: {
                                            start: { constantValue: start.toISOString() },
                                            end: { constantValue: end.toISOString() },
                                          },
                                        },
                                      },
                                      rightField: { constantValue: "system:time_start" },
                                    },
                                  },
                                },
                                {
                                  functionInvocationValue: {
                                    functionName: "Filter.bounds",
                                    arguments: {
                                      geometry: {
                                        functionInvocationValue: {
                                          functionName: "GeometryConstructors.Rectangle",
                                          arguments: {
                                            coordinates: {
                                              constantValue: [
                                                PUNJAB_BBOX[0],
                                                PUNJAB_BBOX[1],
                                                PUNJAB_BBOX[2],
                                                PUNJAB_BBOX[3],
                                              ],
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              count: { constantValue: 200 },
            },
          },
        },
      },
    },
  };

  const url = `https://earthengine.googleapis.com/v1/projects/${project}/value:compute`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(expression),
  });

  if (!res.ok) {
    console.error("GEE compute failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    result?: { features?: Array<{ id?: string; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
  };

  const features = data.result?.features ?? [];
  const points: FirePoint[] = features.map((f, i) => {
    const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
    const props = f.properties ?? {};
    const conf = Number((props as any).confidence ?? (props as any).T21 ?? 0);
    return {
      id: String(f.id ?? `FIRMS-${i}`),
      lat,
      lng,
      confidence: Math.round(conf > 1 ? conf : conf * 100),
      acqTime: String((props as any).acq_date ?? new Date().toISOString()),
    };
  });

  cachedFires = { ts: Date.now(), data: points };
  return points;
}
