import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { FeatureCollection, Polygon } from "geojson";
import { getIndustrialAreas } from "@/lib/overpass.functions";
import { computeLanduseMask, OSM_MASK_BBOX, type MaskKind } from "@/lib/landuseMask";
import type { LiveFire } from "@/components/dashboard/MapView";

export type IndustrialMask = {
  /** True once the Overpass lookup has finished (successfully or not). */
  ready: boolean;
  ok: boolean;
  loading: boolean;
  /** Exact OSM industrial / brick-kiln / commercial / residential polygons. */
  geojson: FeatureCollection<Polygon, { name: string; landuse: MaskKind }> | null;
  /** Fires inside one of those polygons — suppressed. */
  suppressedIds: Set<string>;
  reasonById: Map<string, string>;
  count: number;
};

export function useIndustrialMask(fires: LiveFire[]): IndustrialMask {
  const fetchAreas = useServerFn(getIndustrialAreas);

  const query = useQuery({
    queryKey: ["overpass-landuse-v4", OSM_MASK_BBOX],
    staleTime: 6 * 60 * 60_000,
    retry: 1,
    queryFn: () => fetchAreas({ data: { ...OSM_MASK_BBOX } }),
  });

  return useMemo<IndustrialMask>(() => {
    const { suppressedIds, reasonById, polygons } = computeLanduseMask(fires, query.data?.features ?? []);
    return {
      ready: !query.isLoading,
      ok: Boolean(query.data?.ok),
      loading: query.isLoading || query.isFetching,
      geojson: polygons.length ? { type: "FeatureCollection", features: polygons } : null,
      suppressedIds,
      reasonById,
      count: polygons.length,
    };
  }, [fires, query.data, query.isLoading, query.isFetching]);
}
