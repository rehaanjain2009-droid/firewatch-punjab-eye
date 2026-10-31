import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { polygon } from "@turf/helpers";
import type { LiveFire } from "@/components/dashboard/MapView";
import { loadWardCollection, computeWardMask, type WardCollection } from "@/lib/wardMask";

export type { WardCollection } from "@/lib/wardMask";

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

export function useWardMask(fires: LiveFire[]): WardMask {
  const query = useQuery({
    queryKey: ["ludhiana-wards"],
    staleTime: Infinity,
    queryFn: loadWardCollection,
  });

  return useMemo<WardMask>(() => {
    const wards = query.data ?? null;
    const { suppressedIds, wardById } = computeWardMask(fires, wards);

    // Defensive: validate the asset loads cleanly in development.
    if (import.meta.env.DEV && wards) {
      for (const f of wards.features) {
        try {
          polygon(f.geometry.coordinates);
        } catch {
          // eslint-disable-next-line no-console
          console.warn("[ward-mask] malformed ward ring", f.properties);
        }
      }
    }

    return {
      ready: query.isSuccess,
      loading: query.isLoading || query.isFetching,
      count: wards?.features.length ?? 0,
      geojson: wards,
      suppressedIds,
      wardById,
    };
  }, [fires, query.data, query.isSuccess, query.isLoading, query.isFetching]);
}
