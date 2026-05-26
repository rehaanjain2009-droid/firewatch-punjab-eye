import { SignJWT, importPKCS8 } from "jose";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
};

export type GeeDiagnostic = {
  step:
    | "no-secret"
    | "json-parse"
    | "missing-fields"
    | "import-key"
    | "sign-jwt"
    | "token-exchange"
    | "ee-compute"
    | "ok";
  ok: boolean;
  message: string;
  httpStatus?: number;
  httpBody?: string;
  projectId?: string | null;
  clientEmail?: string;
  saKeys?: string[];
  privateKeyShape?: { hasHeader: boolean; hasFooter: boolean; length: number; firstLine?: string };
};

let cachedToken: { token: string; exp: number } | null = null;

function loadSARaw(): { raw?: string; sa?: ServiceAccount; diag?: GeeDiagnostic } {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return { diag: { step: "no-secret", ok: false, message: "GEE_SERVICE_ACCOUNT_JSON is not set" } };
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    return {
      diag: {
        step: "json-parse",
        ok: false,
        message: `JSON.parse failed: ${(e as Error).message}. First 60 chars: ${raw.slice(0, 60).replace(/\n/g, "\\n")}`,
      },
    };
  }
  const keys = Object.keys(sa);
  if (!sa.client_email || !sa.private_key) {
    return {
      diag: {
        step: "missing-fields",
        ok: false,
        message: `Service account is missing client_email or private_key. Keys present: ${keys.join(", ")}`,
        saKeys: keys,
      },
    };
  }
  return { raw, sa };
}

export function getProjectId(): string | null {
  const env = process.env.GEE_PROJECT_ID;
  if (env) return env;
  const { sa } = loadSARaw();
  return sa?.project_id ?? null;
}

export async function diagnoseGee(): Promise<GeeDiagnostic> {
  const { sa, diag } = loadSARaw();
  if (diag) return diag;
  const projectId = getProjectId();
  const pk = sa!.private_key;
  const pkShape = {
    hasHeader: pk.includes("-----BEGIN PRIVATE KEY-----"),
    hasFooter: pk.includes("-----END PRIVATE KEY-----"),
    length: pk.length,
    firstLine: pk.split("\n")[0],
  };

  let key: CryptoKey;
  try {
    // Normalize escaped \n if user pasted as a single-line string
    const normalized = pk.includes("\\n") && !pk.includes("\n") ? pk.replace(/\\n/g, "\n") : pk;
    key = await importPKCS8(normalized, "RS256");
  } catch (e) {
    return {
      step: "import-key",
      ok: false,
      message: `importPKCS8 failed: ${(e as Error).message}`,
      projectId,
      clientEmail: sa!.client_email,
      privateKeyShape: pkShape,
    };
  }

  let jwt: string;
  try {
    const now = Math.floor(Date.now() / 1000);
    jwt = await new SignJWT({
      scope:
        "https://www.googleapis.com/auth/earthengine.readonly https://www.googleapis.com/auth/cloud-platform",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa!.client_email)
      .setAudience(sa!.token_uri ?? "https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setSubject(sa!.client_email)
      .sign(key);
  } catch (e) {
    return {
      step: "sign-jwt",
      ok: false,
      message: `JWT signing failed: ${(e as Error).message}`,
      projectId,
      clientEmail: sa!.client_email,
      privateKeyShape: pkShape,
    };
  }

  const tokenRes = await fetch(sa!.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return {
      step: "token-exchange",
      ok: false,
      message: `OAuth token exchange failed: HTTP ${tokenRes.status}`,
      httpStatus: tokenRes.status,
      httpBody: body.slice(0, 800),
      projectId,
      clientEmail: sa!.client_email,
      privateKeyShape: pkShape,
    };
  }
  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: tokenData.access_token, exp: Math.floor(Date.now() / 1000) + tokenData.expires_in };

  if (!projectId) {
    return {
      step: "ee-compute",
      ok: false,
      message: "Token obtained, but GEE_PROJECT_ID is not set",
      projectId: null,
      clientEmail: sa!.client_email,
    };
  }

  // Minimal EE ping: evaluate a constant
  const url = `https://earthengine.googleapis.com/v1/projects/${projectId}/value:compute`;
  const pingRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expression: { result: "0", values: { "0": { constantValue: 1 } } } }),
  });
  if (!pingRes.ok) {
    const body = await pingRes.text();
    return {
      step: "ee-compute",
      ok: false,
      message: `Earth Engine compute failed: HTTP ${pingRes.status}`,
      httpStatus: pingRes.status,
      httpBody: body.slice(0, 800),
      projectId,
      clientEmail: sa!.client_email,
    };
  }
  return {
    step: "ok",
    ok: true,
    message: "Authenticated and Earth Engine reachable",
    projectId,
    clientEmail: sa!.client_email,
  };
}

export async function getAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const d = await diagnoseGee();
  return d.ok || cachedToken ? cachedToken?.token ?? null : null;
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const conf = Number(props.confidence ?? props.T21 ?? 0);
    return {
      id: String(f.id ?? `FIRMS-${i}`),
      lat,
      lng,
      confidence: Math.round(conf > 1 ? conf : conf * 100),
      acqTime: String(props.acq_date ?? new Date().toISOString()),
    };
  });
  cachedFires = { ts: Date.now(), data: points };
  return points;
}
