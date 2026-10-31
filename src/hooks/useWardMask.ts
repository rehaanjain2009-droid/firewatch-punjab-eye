import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { LiveFire } from "@/components/dashboard/MapView";

export type WardProps = { ward: string; ward_no: string };
export type WardCollection = FeatureCollection<Polygon, WardProps>;

export type WardMask = {
  ready: boolean;
  loading: boolean;
  /** Number of ward polygons loaded from the MC Ludhiana KML asset. */
  count: number;
  geojson: WardCollection | null;
  /** Fires falling INSIDE any MC ward boundary — suppressed from dispatch. */
  suppressedIds: Set<string>;
  /** fire id -> "Ward 37" label for tooltips / popups. */
  wardById: Map<string, string>;
};

/**
 * Official Municipal Corporation Ludhiana ward boundaries, permanently
 * converted from the supplied LDH_MC_Boundary_Wards KML into GeoJSON.
 * Dynamically imported so the large asset stays out of the initial bundle
 * and is shared by both the browser mask and the cron dispatch route.
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
  fires: LiveFire[],
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

export function useWardMask(fires: LiveFire[]): WardMask {
  const query = useQuery({
    queryKey: ["ludhiana-wards"],
    staleTime: Infinity,
    queryFn: loadWardCollection,
  });

  return useMemo<WardMask>(() => {
    const wards = query.data ?? null;
    const { suppressedIds, wardById } = computeWardMask(fires, wards);

    let count = 0;
    if (wards) {
      count = wards.features.length;
    }
    // Defensive: rebuild Turf polygons only to validate the asset loads cleanly.
    if (import.meta.env.DEV && wards) {
      for (const f of wards.features) {
        try {
          polygon(f.geometry.coordinates as [number, number][]);
        } catch {
          // eslint-disable-next-line no-console
          console.warn("[ward-mask] malformed ward ring", f.properties);
        }
      }
    }

    return {
      ready: query.isSuccess,
      loading: query.isLoading || query.isFetching,
      count,
      geojson: wards,
      suppressedIds,
      wardById,
    };
  }, [fires, query.data, query.isSuccess, query.isLoading, query.isFetching]);
}
