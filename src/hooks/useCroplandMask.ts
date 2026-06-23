import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { classifyFires } from "@/lib/cropland.functions";
import type { LiveFire } from "@/components/dashboard/MapView";

// Rough Ludhiana municipal core polygon — used as a hard urban exclusion
// regardless of the WorldCover pixel result (handles mixed-pixel edges).
const LUDHIANA_URBAN = polygon([
  [
    [75.78, 30.85],
    [75.94, 30.85],
    [75.94, 30.96],
    [75.78, 30.96],
    [75.78, 30.85],
  ],
]);

function inUrban(lat: number, lng: number): boolean {
  return booleanPointInPolygon(point([lng, lat]), LUDHIANA_URBAN);
}

export type CroplandMask = {
  ready: boolean;
  ok: boolean;
  loading: boolean;
  croplandIds: Set<string>;
  suppressedIds: Set<string>;
};

export function useCroplandMask(fires: LiveFire[]): CroplandMask {
  const classify = useServerFn(classifyFires);

  const key = useMemo(
    () =>
      fires
        .map((f) => `${f.id}:${f.lat.toFixed(4)},${f.lng.toFixed(4)}`)
        .sort()
        .join("|"),
    [fires],
  );

  const query = useQuery({
    queryKey: ["cropland-mask", key],
    enabled: fires.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const points = fires.map((f) => ({ id: f.id, lat: f.lat, lng: f.lng }));
      const r = await classify({ data: { points } });
      return r;
    },
  });

  return useMemo<CroplandMask>(() => {
    if (fires.length === 0) {
      return {
        ready: true,
        ok: true,
        loading: false,
        croplandIds: new Set(),
        suppressedIds: new Set(),
      };
    }
    if (!query.data || !query.data.ok) {
      return {
        ready: false,
        ok: !!query.data?.ok,
        loading: query.isLoading || query.isFetching,
        croplandIds: new Set(),
        suppressedIds: new Set(),
      };
    }
    const lcById = new Map<string, number | null>(
      query.data.classifications.map((c) => [c.id, c.landCover]),
    );
    const cropland = new Set<string>();
    const suppressed = new Set<string>();
    for (const f of fires) {
      const lc = lcById.get(f.id) ?? null;
      const isCrop = lc === 40;
      const urban = inUrban(f.lat, f.lng);
      if (isCrop && !urban) cropland.add(f.id);
      else suppressed.add(f.id);
    }
    return {
      ready: true,
      ok: true,
      loading: false,
      croplandIds: cropland,
      suppressedIds: suppressed,
    };
  }, [fires, query.data, query.isLoading, query.isFetching]);
}
