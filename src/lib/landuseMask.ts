import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";
import type { Feature, Polygon } from "geojson";

/**
 * Shared (browser + server) land-use masking rules.
 * Only exact OSM polygons tagged industrial or brick kiln suppress a fire.
 * Residential / commercial tags are NOT masks: rural villages carry
 * landuse=residential, so masking them would hide genuine farm fires.
 * Farmland, forest and any untagged land never suppress.
 */

/** Overpass query envelope for the Ludhiana / central Punjab sector. */
export const OSM_MASK_BBOX = { south: 30.5, west: 75.3, north: 31.15, east: 76.3 } as const;

/** The only OSM classes that suppress a fire. */
export type MaskKind = "industrial" | "brick_kiln";
export const SUPPRESSING_KINDS: readonly MaskKind[] = ["industrial", "brick_kiln"];

export type Ring = [number, number][]; // [lng, lat]
export type IndustrialFeature = {
  id: string;
  name: string;
  /** Suppressing class (kept as `landuse` for display/back-compat). */
  landuse: MaskKind;
  ring: Ring;
};

/** Auto-dispatch threshold: confidence AT OR ABOVE this value dispatches. */
export const DISPATCH_MIN_CONFIDENCE = 70;

export function shouldAutoDispatch(confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= DISPATCH_MIN_CONFIDENCE;
}

/** Map raw OSM tags to a suppressing class, or null when the area must stay unmasked. */
export function classifyOsmTags(tags: Record<string, string>): MaskKind | null {
  if (tags["man_made"] === "kiln" || tags["industrial"] === "brick_kiln") return "brick_kiln";
  if (tags["landuse"] === "industrial") return "industrial";
  return null;
}

type Prepared = {
  feat: Feature<Polygon, { name: string; landuse: MaskKind }>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function prepare(features: IndustrialFeature[]): Prepared[] {
  const out: Prepared[] = [];
  for (const f of features) {
    if (!SUPPRESSING_KINDS.includes(f.landuse)) continue;
    try {
      const feat = polygon([f.ring], { name: f.name, landuse: f.landuse }) as Feature<
        Polygon,
        { name: string; landuse: MaskKind }
      >;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of f.ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      out.push({ feat, minX, minY, maxX, maxY });
    } catch {
      // skip malformed ring
    }
  }
  return out;
}

/**
 * A fire is suppressed only when it lies inside an OSM industrial or
 * brick-kiln polygon. Everything else stays active.
 */
export function computeLanduseMask(
  fires: { id: string; lat: number; lng: number }[],
  features: IndustrialFeature[],
): {
  suppressedIds: Set<string>;
  reasonById: Map<string, string>;
  polygons: Feature<Polygon, { name: string; landuse: MaskKind }>[];
} {
  const prepared = prepare(features);
  const suppressedIds = new Set<string>();
  const reasonById = new Map<string, string>();
  for (const fire of fires) {
    if (!Number.isFinite(fire.lat) || !Number.isFinite(fire.lng)) continue;
    const pt = point([fire.lng, fire.lat]);
    for (const p of prepared) {
      if (fire.lng < p.minX || fire.lng > p.maxX || fire.lat < p.minY || fire.lat > p.maxY) continue;
      if (booleanPointInPolygon(pt, p.feat)) {
        suppressedIds.add(fire.id);
        const kind = p.feat.properties.landuse.replace("_", " ");
        reasonById.set(fire.id, `OSM ${kind} · ${p.feat.properties.name}`);
        break;
      }
    }
  }
  return { suppressedIds, reasonById, polygons: prepared.map((p) => p.feat) };
}
