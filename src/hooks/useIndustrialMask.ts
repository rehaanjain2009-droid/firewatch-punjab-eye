import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { getIndustrialAreas } from "@/lib/overpass.functions";
import type { LiveFire } from "@/components/dashboard/MapView";

// Punjab monitoring envelope [S, W, N, E]
export const PUNJAB_VIEW = { south: 29.5, west: 73.8, north: 32.5, east: 76.9 };

export type IndustrialMask = {
  ready: boolean;
  ok: boolean;
  loading: boolean;
  /** Real OSM industrial/commercial polygons rendered as the exclusion mask. */
  geojson: FeatureCollection<Polygon, { name: string; landuse: string }> | null;
  /** Fires falling inside an industrial polygon — hidden from the feed/map. */
  suppressedIds: Set<string>;
  /** Which site suppressed a given fire (for tooltips/debug). */
  reasonById: Map<string, string>;
  count: number;
};

export function useIndustrialMask(fires: LiveFire[]): IndustrialMask {
  const fetchAreas = useServerFn(getIndustrialAreas);

  const query = useQuery({
    queryKey: ["overpass-industrial", PUNJAB_VIEW],
    staleTime: 6 * 60 * 60_000,
    queryFn: () => fetchAreas({ data: PUNJAB_VIEW }),
  });

  return useMemo<IndustrialMask>(() => {
    const feats: Feature<Polygon, { name: string; landuse: string }>[] = [];
    for (const f of query.data?.features ?? []) {
      try {
        feats.push(
          polygon([f.ring as [number, number][]], { name: f.name, landuse: f.landuse }) as Feature<
            Polygon,
            { name: string; landuse: string }
          >,
        );
      } catch {
        // skip malformed ring
      }
    }

    const suppressedIds = new Set<string>();
    const reasonById = new Map<string, string>();

    for (const fire of fires) {
      // Turf expects [lng, lat]
      const pt = point([fire.lng, fire.lat]);
      for (const poly of feats) {
        if (booleanPointInPolygon(pt, poly)) {
          suppressedIds.add(fire.id);
          reasonById.set(fire.id, `${poly.properties.landuse} · ${poly.properties.name}`);
          break;
        }
      }
    }

    return {
      ready: !query.isLoading,
      ok: Boolean(query.data?.ok),
      loading: query.isLoading || query.isFetching,
      geojson: feats.length
        ? ({ type: "FeatureCollection", features: feats } as FeatureCollection<
            Polygon,
            { name: string; landuse: string }
          >)
        : null,
      suppressedIds,
      reasonById,
      count: feats.length,
    };
  }, [fires, query.data, query.isLoading, query.isFetching]);
}
