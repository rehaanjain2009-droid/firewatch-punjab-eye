import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LiveFire } from "@/components/dashboard/MapView";
import { DIRECTORY_COLUMNS, matchOfficers, type OfficerAssignment, type OfficerDirectoryRow } from "@/lib/officerMatch";

/** Officer assignment per fire id, using the same matcher as the Telegram dispatch. */
export function useOfficerAssignments(fires: LiveFire[]) {
  const query = useQuery({
    queryKey: ["officer-directory"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("officer_directory")
        .select(DIRECTORY_COLUMNS)
        .not("lat", "is", null)
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as OfficerDirectoryRow[];
    },
  });

  const byId = useMemo(() => {
    const m = new Map<string, OfficerAssignment>();
    const dir = query.data ?? [];
    if (dir.length === 0) return m;
    for (const f of fires) {
      const a = matchOfficers(f.lat, f.lng, dir);
      if (a) m.set(f.id, a);
    }
    return m;
  }, [fires, query.data]);

  return { byId, loading: query.isLoading, ready: query.isSuccess };
}
