import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon } from "geojson";

export type WardProps = { ward: string; ward_no: string };
export type WardCollection = FeatureCollection<Polygon, WardProps>;

/**
 * Official Municipal Corporation Ludhiana ward boundaries, permanently
 * converted from the supplied LDH_MC_Boundary_Wards KML into GeoJSON
 * (src/data/ludhiana_wards.json). Dynamically imported so the large asset
 * stays out of the initial bundle and is shared by the browser mask and the
 * cron dispatch route.
 */
export async function loadWardCollection(): Promise<WardCollection> {
  const mod = await import("@/data/ludhiana_wards.json");
  return mod.default as unknown as WardCollection;
}

/**
 * Strict spatial masking against every MC Ludhiana ward polygon.
 * A fire inside ANY ward boundary is urban -> status "suppressed".
 * Only fires outside all ward boundaries remain "active" candidates.
 */
export function computeWardMask(
  fires: { id: string; lat: number; lng: number }[],
  wards: WardCollection | null,
): { suppressedIds: Set<string>; wardById: Map<string, string> } {
  const feats: Feature<Polygon, WardProps>[] = (wards?.features ?? []) as Feature<Polygon, WardProps>[];
  const suppressedIds = new Set<string>();
  const wardById = new Map<string, string>();

  for (const fire of fires) {
    if (!Number.isFinite(fire.lat) || !Number.isFinite(fire.lng)) continue;
    // Turf expects [lng, lat]; NASA FIRMS provides latitude first.
    const pt = point([fire.lng, fire.lat]);
    for (const poly of feats) {
      try {
        if (booleanPointInPolygon(pt, poly)) {
          suppressedIds.add(fire.id);
          wardById.set(fire.id, `Ward ${poly.properties.ward || poly.properties.ward_no}`);
          break;
        }
      } catch {
        // skip malformed ring
      }
    }
  }
  return { suppressedIds, wardById };
}
