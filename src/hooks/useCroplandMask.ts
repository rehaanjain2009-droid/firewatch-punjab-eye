import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodeFires } from "@/lib/geocode.functions";
import type { LiveFire } from "@/components/dashboard/MapView";

export type PlaceInfo = { label: string; landUse: string; urban: boolean; ok: boolean };

export type CroplandMask = {
  ready: boolean;
  ok: boolean;
  loading: boolean;
  croplandIds: Set<string>; // fires kept (valid stubble candidates)
  suppressedIds: Set<string>; // urban / false positives — hidden
  places: Map<string, PlaceInfo>; // real reverse-geocoded land use per fire
};

/**
 * Land-use filter backed by real OpenStreetMap Nominatim reverse geocoding.
 * Urban land use (city/town/residential/commercial/industrial/suburb) is
 * suppressed as a false positive. Rural indicators (farmland, village,
 * county, state) or a failed lookup are always KEPT.
 */
export function useCroplandMask(fires: LiveFire[]): CroplandMask {
  const geocode = useServerFn(geocodeFires);

  const key = useMemo(
    () =>
      fires
        .map((f) => `${f.id}:${f.lat.toFixed(3)},${f.lng.toFixed(3)}`)
        .sort()
        .join("|"),
    [fires],
  );

  const query = useQuery({
    queryKey: ["nominatim-landuse", key],
    enabled: fires.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const points = fires.map((f) => ({ id: f.id, lat: f.lat, lng: f.lng }));
      return geocode({ data: { points } });
    },
  });

  return useMemo<CroplandMask>(() => {
    const places = new Map<string, PlaceInfo>();
    for (const p of query.data?.places ?? []) {
      places.set(p.id, { label: p.label, landUse: p.landUse, urban: p.urban, ok: p.ok });
    }

    const kept = new Set<string>();
    const suppressed = new Set<string>();

    for (const f of fires) {
      const info = places.get(f.id);
      const shouldSuppress = Boolean(info?.ok && info.urban);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[landuse-mask]", {
          id: f.id,
          coords: [f.lat, f.lng],
          landUse: info?.landUse ?? "pending",
          label: info?.label ?? "pending",
          suppressed: shouldSuppress,
        });
      }

      if (shouldSuppress) suppressed.add(f.id);
      else kept.add(f.id);
    }

    return {
      ready: true,
      ok: true,
      loading: query.isLoading || query.isFetching,
      croplandIds: kept,
      suppressedIds: suppressed,
      places,
    };
  }, [fires, query.data, query.isLoading, query.isFetching]);
}
