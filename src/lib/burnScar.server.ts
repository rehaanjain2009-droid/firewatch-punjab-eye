import { getAccessToken, getProjectId } from "./gee.server";
import {
  addDays,
  AUDIT_RADIUS_M,
  classifyVerdict,
  DNBR_BURN_THRESHOLD,
  POST_NBR_CHAR_MAX,
  hectaresToAcres,
  POST_WINDOW_DAYS,
  PRE_WINDOW_DAYS,
  THUMB_HALF_WIDTH_M,
  type BurnVerdict,
} from "./burnScar";

/**
 * Sentinel-2 ΔNBR burn scar audit through Earth Engine's REST API.
 * Source: COPERNICUS/S2_SR_HARMONIZED (Copernicus Sentinel-2 L2A, 10 m),
 * cloud/shadow masked with the scene classification (SCL) band.
 *  - pre-fire  = latest clear pixel in the PRE_WINDOW_DAYS before detection
 *  - post-fire = earliest clear pixel from the day after detection
 *  - NBR = (B8 NIR − B12 SWIR) / (B8 + B12); ΔNBR = NBR_pre − NBR_post
 */

type Node = Record<string, unknown>;
const c = (v: unknown): Node => ({ constantValue: v });
const fn = (name: string, args: Record<string, Node>): Node => ({
  functionInvocationValue: { functionName: name, arguments: args },
});
const img = (v: number): Node => fn("Image.constant", { value: c(v) });

const BANDS = ["B2", "B3", "B4", "B8", "B12"];

/** SCL: keep dark-area (2, burn scars often land here), vegetation, bare soil, water, unclassified. */
const MASK_BODY: Node = (() => {
  const image = { argumentReference: "img" };
  const scl = fn("Image.select", { input: image, bandSelectors: c(["SCL"]) });
  const clear = fn("Image.and", {
    image1: fn("Image.and", {
      image1: fn("Image.gte", { image1: scl, image2: img(2) }),
      image2: fn("Image.lte", { image1: scl, image2: img(7) }),
    }),
    image2: fn("Image.and", {
      image1: fn("Image.neq", { image1: scl, image2: img(3) }),
      // Haze and thin cloud often slip through SCL; drop pixels with ≥ 20% cloud probability.
      image2: fn("Image.lt", {
        image1: fn("Image.select", { input: image, bandSelectors: c(["MSK_CLDPRB"]) }),
        image2: img(20),
      }),
    }),
  });
  return fn("Image.select", { input: fn("Image.updateMask", { image, mask: clear }), bandSelectors: c(BANDS) });
})();

function expr(result: Node) {
  return { expression: { result: "out", values: { out: result, maskBody: MASK_BODY } } };
}

function geometry(lat: number, lng: number) {
  const point = fn("GeometryConstructors.Point", { coordinates: c([lng, lat]) });
  const aoi = fn("Geometry.buffer", { geometry: point, distance: c(AUDIT_RADIUS_M) });
  return { point, aoi };
}

function collection(point: Node, start: string, end: string): Node {
  return fn("Collection.filter", {
    collection: fn("ImageCollection.load", { id: c("COPERNICUS/S2_SR_HARMONIZED") }),
    filter: fn("Filter.and", {
      filters: {
        arrayValue: {
          values: [
            fn("Filter.intersects", { leftField: c(".geo"), rightValue: point }),
            fn("Filter.dateRangeContains", {
              leftValue: fn("DateRange", { start: c(start), end: c(end) }),
              rightField: c("system:time_start"),
            }),
          ],
        },
      },
    }),
  });
}

const maskedCol = (col: Node) =>
  fn("Collection.map", {
    collection: col,
    baseAlgorithm: { functionDefinitionValue: { argumentNames: ["img"], body: "maskBody" } },
  });

/** Pre-fire baseline: per-pixel median of clear scenes (robust to haze that slips past the masks). */
function preComposite(col: Node): Node {
  return fn("Image.rename", {
    input: fn("ImageCollection.reduce", { collection: maskedCol(col), reducer: fn("Reducer.median", {}) }),
    names: c(BANDS),
  });
}

/** Post-fire: earliest clear pixel after detection (before ploughing/sowing hides the char). */
function postComposite(col: Node): Node {
  const sorted = fn("Collection.limit", { collection: maskedCol(col), key: c("system:time_start"), ascending: c(false) });
  return fn("ImageCollection.mosaic", { collection: sorted });
}

/** ESA WorldCover 10 m cropland (class 40): only farmland can count as an agricultural burn scar. */
const CROPLAND = fn("Image.eq", {
  image1: fn("Collection.first", { collection: fn("ImageCollection.load", { id: c("ESA/WorldCover/v200") }) }),
  image2: img(40),
});

const nbr = (image: Node) =>
  fn("Image.normalizedDifference", { input: fn("Image.select", { input: image, bandSelectors: c(["B8", "B12"]) }) });
const rename = (image: Node, name: string) => fn("Image.rename", { input: image, names: c([name]) });
const addBands = (a: Node, b: Node) => fn("Image.addBands", { dstImg: a, srcImg: b });

async function eeCompute<T>(token: string, project: string, result: Node): Promise<T> {
  const res = await fetch(`https://earthengine.googleapis.com/v1/projects/${project}/value:compute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(expr(result)),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[burnscar] value:compute failed [${res.status}]: ${body.slice(0, 600)}`);
    throw new Error(`Earth Engine compute failed (HTTP ${res.status})`);
  }
  return ((await res.json()) as { result: T }).result;
}

type Grid = { lat: number; lng: number };

/** Render a visualized image to JPEG over a square frame centred on the hotspot (image:computePixels). */
async function eeThumbnail(token: string, project: string, image: Node, at: Grid): Promise<string | null> {
  const size = 512;
  const dLat = THUMB_HALF_WIDTH_M / 111_320;
  const dLng = THUMB_HALF_WIDTH_M / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  const res = await fetch(`https://earthengine.googleapis.com/v1/projects/${project}/image:computePixels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...expr(image),
      fileFormat: "JPEG",
      grid: {
        dimensions: { width: size, height: size },
        affineTransform: {
          scaleX: (2 * dLng) / size,
          shearX: 0,
          translateX: at.lng - dLng,
          shearY: 0,
          scaleY: -(2 * dLat) / size,
          translateY: at.lat + dLat,
        },
        crsCode: "EPSG:4326",
      },
    }),
  });
  if (!res.ok) {
    console.error(`[burnscar] computePixels failed [${res.status}]: ${(await res.text()).slice(0, 400)}`);
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

export type SceneInfo = { id: string; date: string };

export type BurnScarResult = {
  verdict: BurnVerdict;
  burnedHa: number;
  burnedAcres: number;
  auditedHa: number;
  clearFraction: number;
  meanDnbrBurned: number | null;
  meanDnbrAll: number | null;
  meanPreNbr: number | null;
  meanPostNbr: number | null;
  preScenes: SceneInfo[];
  postScenes: SceneInfo[];
  preWindow: [string, string];
  postWindow: [string, string];
  thumbnails: { preTrue: string | null; postTrue: string | null; postFalse: string | null; dnbr: string | null } | null;
};

const round = (v: unknown, d = 3): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;

export async function analyseBurnScar(input: {
  lat: number;
  lng: number;
  acqDate: string;
  withThumbnails: boolean;
}): Promise<BurnScarResult> {
  const token = await getAccessToken();
  const project = getProjectId();
  if (!token || !project) throw new Error("Earth Engine is not configured");

  const today = new Date().toISOString().slice(0, 10);
  const preWindow: [string, string] = [addDays(input.acqDate, -PRE_WINDOW_DAYS), input.acqDate];
  const postStart = addDays(input.acqDate, 1);
  const postEndCap = addDays(input.acqDate, POST_WINDOW_DAYS);
  const postWindow: [string, string] = [postStart, postEndCap < addDays(today, 1) ? postEndCap : addDays(today, 1)];

  const { point, aoi } = geometry(input.lat, input.lng);
  const at = { lat: input.lat, lng: input.lng };
  const preCol = collection(point, preWindow[0], preWindow[1]);
  const postCol = collection(point, postWindow[0], postWindow[1]);

  const sceneList = (col: Node) => ({
    arrayValue: {
      values: [
        fn("AggregateFeatureCollection.array", { collection: col, property: c("system:index") }),
        fn("AggregateFeatureCollection.array", { collection: col, property: c("system:time_start") }),
      ],
    },
  });
  const [preRaw, postRaw] =
    postWindow[0] >= postWindow[1]
      ? [await eeCompute<[string[], number[]]>(token, project, sceneList(preCol)), [[], []] as [string[], number[]]]
      : await eeCompute<[[string[], number[]], [string[], number[]]]>(token, project, {
          arrayValue: { values: [sceneList(preCol), sceneList(postCol)] },
        });
  const toScenes = ([ids, times]: [string[], number[]]): SceneInfo[] =>
    ids
      .map((id, i) => ({ id, date: new Date(times[i]).toISOString().slice(0, 10) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const preScenes = toScenes(preRaw);
  const postScenes = toScenes(postRaw);

  const empty: BurnScarResult = {
    verdict: classifyVerdict({ preScenes: preScenes.length, postScenes: postScenes.length, clearFraction: 0, burnedHa: 0 }),
    burnedHa: 0,
    burnedAcres: 0,
    auditedHa: round((Math.PI * AUDIT_RADIUS_M ** 2) / 10_000, 2) ?? 0,
    clearFraction: 0,
    meanDnbrBurned: null,
    meanDnbrAll: null,
    meanPreNbr: null,
    meanPostNbr: null,
    preScenes,
    postScenes,
    preWindow,
    postWindow,
    thumbnails: null,
  };
  if (preScenes.length === 0 || postScenes.length === 0) {
    if (input.withThumbnails && preScenes.length > 0) {
      const pre = preComposite(preCol);
      empty.thumbnails = {
        preTrue: await eeThumbnail(token, project, trueColor(pre), at),
        postTrue: null,
        postFalse: null,
        dnbr: null,
      };
    }
    return empty;
  }

  const pre = preComposite(preCol);
  const post = postComposite(postCol);
  const preNbr = nbr(pre);
  const postNbr = nbr(post);
  const dnbr = fn("Image.subtract", { image1: preNbr, image2: postNbr });
  // Burned = NBR dropped by ≥ threshold AND the surface is now charred (negative NBR).
  // The char test separates real burns from paddy harvest, which also lowers NBR.
  const burned = fn("Image.and", {
    image1: fn("Image.gte", { image1: dnbr, image2: img(DNBR_BURN_THRESHOLD) }),
    image2: fn("Image.and", {
      image1: fn("Image.lt", { image1: postNbr, image2: img(POST_NBR_CHAR_MAX) }),
      image2: CROPLAND,
    }),
  });
  const burnedOnly = fn("Image.updateMask", { image: burned, mask: burned });
  const valid = fn("Image.gte", { image1: dnbr, image2: img(-10) });
  const area = fn("Image.pixelArea", {});

  const areaStack = addBands(
    addBands(
      rename(fn("Image.multiply", { image1: burnedOnly, image2: area }), "burned"),
      rename(fn("Image.multiply", { image1: valid, image2: area }), "valid"),
    ),
    rename(area, "total"),
  );
  const meanStack = addBands(
    addBands(
      rename(fn("Image.updateMask", { image: dnbr, mask: burned }), "dnbr_burned"),
      rename(dnbr, "dnbr_all"),
    ),
    addBands(rename(preNbr, "pre_nbr"), rename(postNbr, "post_nbr")),
  );
  const reduce = (image: Node, reducer: string) =>
    fn("Image.reduceRegion", {
      image,
      reducer: fn(reducer, {}),
      geometry: aoi,
      scale: c(10),
      maxPixels: c(1e8),
    });

  const statsPromise = eeCompute<[Record<string, number>, Record<string, number | null>]>(token, project, {
    arrayValue: { values: [reduce(areaStack, "Reducer.sum"), reduce(meanStack, "Reducer.mean")] },
  });
  const thumbsPromise = input.withThumbnails
    ? Promise.all([
        eeThumbnail(token, project, trueColor(pre), at),
        eeThumbnail(token, project, trueColor(post), at),
        eeThumbnail(
          token,
          project,
          fn("Image.visualize", {
            image: post,
            bands: c(["B12", "B8", "B4"]),
            min: c(300),
            max: c(4000),
          }),
          at,
        ),
        eeThumbnail(
          token,
          project,
          fn("Image.visualize", {
            image: dnbr,
            min: c(-0.1),
            max: c(0.5),
            palette: c(["1a9850", "91cf60", "d9ef8b", "fee08b", "fc8d59", "d73027"]),
          }),
          at,
        ),
      ])
    : Promise.resolve(null);

  const [[sums, means], thumbs] = await Promise.all([statsPromise, thumbsPromise]);
  const burnedHa = round((sums.burned ?? 0) / 10_000, 2) ?? 0;
  const total = sums.total ?? 0;
  const clearFraction = total > 0 ? round((sums.valid ?? 0) / total, 3) ?? 0 : 0;

  return {
    ...empty,
    verdict: classifyVerdict({ preScenes: preScenes.length, postScenes: postScenes.length, clearFraction, burnedHa }),
    burnedHa,
    burnedAcres: hectaresToAcres(burnedHa),
    auditedHa: round(total / 10_000, 2) ?? empty.auditedHa,
    clearFraction,
    meanDnbrBurned: round(means.dnbr_burned),
    meanDnbrAll: round(means.dnbr_all),
    meanPreNbr: round(means.pre_nbr),
    meanPostNbr: round(means.post_nbr),
    thumbnails: thumbs ? { preTrue: thumbs[0], postTrue: thumbs[1], postFalse: thumbs[2], dnbr: thumbs[3] } : null,
  };
}

function trueColor(image: Node): Node {
  return fn("Image.visualize", {
    image,
    bands: c(["B4", "B3", "B2"]),
    min: c(200),
    max: c(2200),
    gamma: c(1.2),
  });
}

/** Shape stored in burn_scar_verifications (evidence record, append-only). */
export function toVerificationRow(
  fireKey: string,
  input: { lat: number; lng: number; acqDate: string },
  r: BurnScarResult,
  source: "manual" | "auto_cron",
) {
  return {
    fire_key: fireKey,
    lat: input.lat,
    lng: input.lng,
    acq_date: input.acqDate,
    verdict: r.verdict,
    burned_ha: r.burnedHa,
    burned_acres: r.burnedAcres,
    audited_ha: r.auditedHa,
    clear_fraction: r.clearFraction,
    mean_dnbr_burned: r.meanDnbrBurned,
    mean_dnbr_all: r.meanDnbrAll,
    mean_pre_nbr: r.meanPreNbr,
    mean_post_nbr: r.meanPostNbr,
    pre_scenes: r.preScenes,
    post_scenes: r.postScenes,
    pre_window_start: r.preWindow[0],
    pre_window_end: r.preWindow[1],
    post_window_start: r.postWindow[0],
    post_window_end: r.postWindow[1],
    method: METHOD,
    source,
  };
}

export const METHOD = {
  collection: "COPERNICUS/S2_SR_HARMONIZED (Sentinel-2 L2A, 10 m)",
  cloudMask: "SCL in {2,4,5,6,7} and MSK_CLDPRB < 20",
  preComposite: `median of clear pixels, ${PRE_WINDOW_DAYS} days before detection`,
  postComposite: `earliest clear pixel, day after detection up to ${POST_WINDOW_DAYS} days`,
  index: "NBR = (B8 - B12) / (B8 + B12); dNBR = NBR_pre - NBR_post",
  burnRule: `dNBR >= ${DNBR_BURN_THRESHOLD} AND NBR_post < ${POST_NBR_CHAR_MAX} AND ESA WorldCover v200 class 40 (cropland)`,
  auditRadiusM: AUDIT_RADIUS_M,
};

/**
 * Hourly follow-up for dispatched alerts: Sentinel-2 revisits every ~5 days, so
 * the scar can only be measured after a post-fire pass. Re-check each dispatched
 * incident (2–30 days old) at most once a day until a final verdict is stored.
 */
export async function autoVerifyDispatched(
  client: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
  maxPerRun = 3,
): Promise<{ checked: number; confirmed: number }> {
  const now = Date.now();
  const { data: incidents, error } = await client
    .from("incidents_audit_log")
    .select("fire_key, lat, lng, detected_at")
    .not("dispatched_at", "is", null)
    .gte("detected_at", new Date(now - POST_WINDOW_DAYS * 86400_000).toISOString())
    .lte("detected_at", new Date(now - 2 * 86400_000).toISOString())
    .order("detected_at", { ascending: false })
    .limit(100);
  if (error || !incidents?.length) return { checked: 0, confirmed: 0 };

  const { data: prior } = await client
    .from("burn_scar_verifications")
    .select("fire_key, verdict, created_at")
    .in("fire_key", incidents.map((i) => i.fire_key));
  const done = new Set<string>();
  const recent = new Set<string>();
  for (const p of prior ?? []) {
    if (p.verdict === "confirmed" || p.verdict === "not_detected") done.add(p.fire_key);
    if (now - new Date(p.created_at).getTime() < 24 * 3600_000) recent.add(p.fire_key);
  }

  let checked = 0;
  let confirmed = 0;
  for (const inc of incidents) {
    if (checked >= maxPerRun) break;
    if (done.has(inc.fire_key) || recent.has(inc.fire_key)) continue;
    const input = { lat: inc.lat, lng: inc.lng, acqDate: inc.detected_at.slice(0, 10) };
    try {
      const r = await analyseBurnScar({ ...input, withThumbnails: false });
      await client.from("burn_scar_verifications").insert({
        ...toVerificationRow(inc.fire_key, input, r, "auto_cron"),
        verified_by: null,
      });
      checked++;
      if (r.verdict === "confirmed") confirmed++;
    } catch (err) {
      console.error(`[burnscar] auto-verify ${inc.fire_key} failed:`, err);
    }
  }
  return { checked, confirmed };
}
