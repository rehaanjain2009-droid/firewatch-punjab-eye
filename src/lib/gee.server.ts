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
};

let cachedToken: { token: string; exp: number } | null = null;

function loadSARaw(): { sa?: ServiceAccount; diag?: GeeDiagnostic } {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { diag: { step: "no-secret", ok: false, message: "GEE_SERVICE_ACCOUNT_JSON is not set" } };
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    return { diag: { step: "json-parse", ok: false, message: `JSON.parse failed: ${(e as Error).message}` } };
  }
  if (!sa.client_email || !sa.private_key) {
    return { diag: { step: "missing-fields", ok: false, message: "Service account missing client_email/private_key" } };
  }
  return { sa };
}

export function getProjectId(): string | null {
  const env = process.env.GEE_PROJECT_ID;
  if (env) return env;
  const { sa } = loadSARaw();
  return sa?.project_id ?? null;
}

async function exchangeToken(sa: ServiceAccount): Promise<{ token?: string; diag?: GeeDiagnostic }> {
  const pk = sa.private_key.includes("\\n") && !sa.private_key.includes("\n")
    ? sa.private_key.replace(/\\n/g, "\n")
    : sa.private_key;
  let key: CryptoKey;
  try {
    key = await importPKCS8(pk, "RS256");
  } catch (e) {
    return { diag: { step: "import-key", ok: false, message: `importPKCS8 failed: ${(e as Error).message}` } };
  }
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/earthengine.readonly https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const tokenRes = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenRes.ok) {
    return {
      diag: {
        step: "token-exchange", ok: false,
        message: `OAuth token exchange failed: HTTP ${tokenRes.status}`,
        httpStatus: tokenRes.status, httpBody: (await tokenRes.text()).slice(0, 600),
      },
    };
  }
  const data = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: Math.floor(Date.now() / 1000) + data.expires_in };
  return { token: data.access_token };
}

export async function getAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const { sa, diag } = loadSARaw();
  if (diag || !sa) return null;
  const { token } = await exchangeToken(sa);
  return token ?? null;
}

export async function diagnoseGee(): Promise<GeeDiagnostic> {
  const { sa, diag } = loadSARaw();
  if (diag) return diag;
  const projectId = getProjectId();
  const ex = await exchangeToken(sa!);
  if (ex.diag) return { ...ex.diag, clientEmail: sa!.client_email, projectId };
  if (!projectId) {
    return { step: "ee-compute", ok: false, message: "Token obtained, but GEE_PROJECT_ID is not set", clientEmail: sa!.client_email };
  }
  // Ping EE
  const url = `https://earthengine.googleapis.com/v1/projects/${projectId}/value:compute`;
  const pingRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ex.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expression: { result: "0", values: { "0": { constantValue: 1 } } } }),
  });
  if (!pingRes.ok) {
    return {
      step: "ee-compute", ok: false,
      message: `Earth Engine compute failed: HTTP ${pingRes.status}`,
      httpStatus: pingRes.status, httpBody: (await pingRes.text()).slice(0, 600),
      projectId, clientEmail: sa!.client_email,
    };
  }
  return { step: "ok", ok: true, message: "Authenticated · Earth Engine reachable", projectId, clientEmail: sa!.client_email };
}

// ============================================================
// NASA FIRMS — direct REST (live fire points)
// ============================================================

// Live monitoring focus: Ludhiana / Punjab region
export const PUNJAB_BBOX = [73.9, 29.5, 76.9, 32.5] as const;

export type FirePoint = {
  id: string;
  lat: number;
  lng: number;
  confidence: number;
  brightness: number;
  frp: number;
  acqDate: string;
  acqTime: string;
  daynight: "D" | "N";
  satellite: string;
};

let cachedFires: { ts: number; data: FirePoint[]; source: string } | null = null;

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cols = ln.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cols[i] ?? "").trim()));
    return row;
  });
}

function confToNum(c: string): number {
  // VIIRS uses "n"/"l"/"h"; MODIS uses 0-100 integer
  if (!c) return 0;
  const upper = c.toLowerCase();
  if (upper === "h") return 90;
  if (upper === "n") return 70;
  if (upper === "l") return 40;
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchActiveFires(dayRange = 1): Promise<{ fires: FirePoint[]; source: string } | null> {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) return null;
  const bbox = PUNJAB_BBOX.join(",");
  // Four separate live requests — one per FIRMS NRT source (MODIS + SUOMI/NOAA-20/NOAA-21 VIIRS).
  // FIRMS canonical source ids are VIIRS_SNPP_NRT / VIIRS_NOAA20_NRT / VIIRS_NOAA21_NRT.
  const sources = ["MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"];
  const results = await Promise.all(
    sources.map(async (src) => {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${src}/${bbox}/${dayRange}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          console.error(`[firms] ${src} HTTP ${res.status}`);
          return { src, rows: [] as Record<string, string>[] };
        }
        const text = await res.text();
        if (text.startsWith("Invalid") || text.startsWith("No fire") || !text.includes("latitude")) {
          console.warn(`[firms] ${src} -> ${text.slice(0, 80)}`);
          return { src, rows: [] as Record<string, string>[] };
        }
        const rows = parseCsv(text);
        console.log(`[firms] ${src} rows=${rows.length}`);
        return { src, rows };
      } catch (e) {
        console.error(`[firms] ${src} failed`, (e as Error).message);
        return { src, rows: [] as Record<string, string>[] };
      }
    }),
  );

  const seen = new Set<string>();
  const fires: FirePoint[] = [];
  const active: string[] = [];
  for (const { src, rows } of results) {
    if (rows.length === 0) continue;
    active.push(src);
    const tag = src.replace("_NRT", "");
    rows.forEach((r, i) => {
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const dedupeKey = `${lat.toFixed(4)}|${lng.toFixed(4)}|${r.acq_date ?? ""}|${r.acq_time ?? ""}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      fires.push({
        id: `FIRMS-${tag}-${i + 1}`,
        lat,
        lng,
        confidence: confToNum(r.confidence),
        brightness: Number(r.bright_ti4 ?? r.brightness ?? 0),
        frp: Number(r.frp ?? 0),
        acqDate: r.acq_date ?? "",
        acqTime: r.acq_time ?? "",
        daynight: (r.daynight as "D" | "N") ?? "D",
        satellite: r.satellite ?? tag,
      });
    });
  }

  const source = active.length ? active.join(" + ") : "none";
  cachedFires = { ts: Date.now(), data: fires, source };
  return { fires, source };
}


// ============================================================
// Earth Engine — getMapId for tile overlays
// ============================================================

export type TileLayer = { id: "nbr" | "cropland"; label: string; tileUrl: string };

let cachedTiles: { ts: number; data: TileLayer[] } | null = null;

// Sentinel-2 NBR burn-scar (last 30d), masked to vegetation drop
const NBR_EXPRESSION = {
  expression: {
    result: "0",
    values: {
      "0": {
        functionInvocationValue: {
          functionName: "Image.visualize",
          arguments: {
            image: {
              functionInvocationValue: {
                functionName: "Image.normalizedDifference",
                arguments: {
                  input: {
                    functionInvocationValue: {
                      functionName: "Image.select",
                      arguments: {
                        input: {
                          functionInvocationValue: {
                            functionName: "ImageCollection.median",
                            arguments: {
                              collection: {
                                functionInvocationValue: {
                                  functionName: "Collection.filterDate",
                                  arguments: {
                                    collection: { functionInvocationValue: { functionName: "ImageCollection.load", arguments: { id: { constantValue: "COPERNICUS/S2_SR_HARMONIZED" } } } },
                                    start: { constantValue: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10) },
                                    end: { constantValue: new Date().toISOString().slice(0, 10) },
                                  },
                                },
                              },
                            },
                          },
                        },
                        bandSelectors: { constantValue: ["B8", "B12"] },
                      },
                    },
                  },
                },
              },
            },
            palette: { constantValue: ["330000", "990000", "ff3300", "ffcc00"] },
            min: { constantValue: -1 },
            max: { constantValue: 0.3 },
          },
        },
      },
    },
  },
};

// ESA WorldCover v200 — cropland class = 40
const CROPLAND_EXPRESSION = {
  expression: {
    result: "0",
    values: {
      "0": {
        functionInvocationValue: {
          functionName: "Image.visualize",
          arguments: {
            image: {
              functionInvocationValue: {
                functionName: "Image.eq",
                arguments: {
                  image1: {
                    functionInvocationValue: {
                      functionName: "ImageCollection.first",
                      arguments: {
                        collection: { functionInvocationValue: { functionName: "ImageCollection.load", arguments: { id: { constantValue: "ESA/WorldCover/v200" } } } },
                      },
                    },
                  },
                  image2: { constantValue: 40 },
                },
              },
            },
            palette: { constantValue: ["000000", "00ff88"] },
            min: { constantValue: 0 },
            max: { constantValue: 1 },
            opacity: { constantValue: 0.5 },
          },
        },
      },
    },
  },
};

async function createMap(expression: unknown, token: string, project: string): Promise<string | null> {
  const url = `https://earthengine.googleapis.com/v1/projects/${project}/maps`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(expression),
  });
  if (!res.ok) {
    console.error("GEE getMapId failed", res.status, (await res.text()).slice(0, 400));
    return null;
  }
  const data = (await res.json()) as { name?: string };
  if (!data.name) return null;
  return `https://earthengine.googleapis.com/v1/${data.name}/tiles/{z}/{x}/{y}`;
}

export async function fetchTileLayers(): Promise<TileLayer[] | null> {
  const token = await getAccessToken();
  const project = getProjectId();
  if (!token || !project) return null;
  if (cachedTiles && Date.now() - cachedTiles.ts < 30 * 60_000) return cachedTiles.data;

  const [nbr, crop] = await Promise.all([
    createMap(NBR_EXPRESSION, token, project),
    createMap(CROPLAND_EXPRESSION, token, project),
  ]);
  const layers: TileLayer[] = [];
  if (nbr) layers.push({ id: "nbr", label: "Sentinel-2 NBR (30d)", tileUrl: nbr });
  if (crop) layers.push({ id: "cropland", label: "ESA WorldCover Cropland", tileUrl: crop });
  cachedTiles = { ts: Date.now(), data: layers };
  return layers;
}
