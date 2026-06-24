import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { classifyFires } from "@/lib/cropland.functions";
import type { LiveFire } from "@/components/dashboard/MapView";

// Ludhiana urban core polygon. Ring coordinates are [lng, lat] per GeoJSON /
// Turf convention. DO NOT FLIP — NASA FIRMS gives lat first, Turf wants lng
// first. The envelope below (75.78–75.94 E, 30.85–30.96 N) sits inside the
// Punjab agricultural box of 74.5–76.5 E / 30.0–31.5 N.
const LUDHIANA_URBAN = polygon([
  [
    [75.78, 30.85],
    [75.94, 30.85],
    [75.94, 30.96],
    [75.78, 30.96],
    [75.78, 30.85],
  ],
]);

function toTurfCoord(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

function inUrban(lat: number, lng: number): boolean {
  return booleanPointInPolygon(point(toTurfCoord(lat, lng)), LUDHIANA_URBAN);
}

// WorldCover classes that we treat as a positive non-agricultural match.
// Anything else (including null / undefined from a failed sample, 30 grassland,
// 40 cropland, etc.) is a safe-default KEEP.
const BUILT_UP = 50;
const WATER = 80;
function isConfirmedNonCropland(code: number | null | undefined): boolean {
  return code === BUILT_UP || code === WATER;
}

export type CroplandMask = {
  ready: boolean;
  ok: boolean;
  loading: boolean;
  croplandIds: Set<string>; // fires kept (informational)
  suppressedIds: Set<string>; // single source of truth for hiding
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
      return classify({ data: { points } });
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

    // Safe fallback: if the GEE call hasn't returned or failed, we still
    // mark the mask as ready/ok so the urban polygon check runs, but no fire
    // is suppressed solely because classification is missing.
    const classifications = query.data?.ok ? query.data.classifications : [];
    const lcById = new Map<string, number | null>(
      classifications.map((c) => [c.id, c.landCover]),
    );

    const kept = new Set<string>();
    const suppressed = new Set<string>();

    for (const f of fires) {
      const lc = lcById.has(f.id) ? lcById.get(f.id) ?? null : null;
      const urban = inUrban(f.lat, f.lng);
      const builtOrWater = isConfirmedNonCropland(lc);
      const shouldSuppress = urban || builtOrWater;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[cropland-mask]", {
          id: f.id,
          firmsCoords: [f.lat, f.lng],
          turfCoords: toTurfCoord(f.lat, f.lng),
          landCover: lc,
          urban,
          builtOrWater,
          suppressed: shouldSuppress,
        });
      }

      if (shouldSuppress) suppressed.add(f.id);
      else kept.add(f.id);
    }

    const loading = query.isLoading || query.isFetching;
    return {
      ready: true,
      ok: true,
      loading,
      croplandIds: kept,
      suppressedIds: suppressed,
    };
  }, [fires, query.data, query.isLoading, query.isFetching]);
}
