import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import type { LiveFire } from "@/components/dashboard/MapView";
import { DispatchFeed, type FireStatus } from "@/components/dashboard/DispatchFeed";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { OfficerOnboardingModal } from "@/components/dashboard/OfficerOnboardingModal";
import { getActiveFires, getGeeStatus, getTileLayers } from "@/lib/gee.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useCroplandMask } from "@/hooks/useCroplandMask";
import { useIndustrialMask } from "@/hooks/useIndustrialMask";

const MapView = lazy(() => import("@/components/dashboard/MapView").then((m) => ({ default: m.MapView })));

export const Route = createFileRoute("/_authenticated/")({
  loader: async () => {
    const profile = await getMyProfile();
    if (!profile?.telegram_handle) {
      throw redirect({ to: "/onboarding" });
    }
    return { profile };
  },
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "PPF Command & Control · Ludhiana Stubble Fire Intelligence" },
      { name: "description", content: "Punjab Pollution Control tactical dashboard for real-time NASA FIRMS detections, Sentinel-2 burn-scar overlays, and field dispatch across the Ludhiana sector." },
    ],
  }),
});

const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
  { name: "Jalandhar", lat: 31.3260, lng: 75.5762 },
  { name: "Khanna", lat: 30.7040, lng: 76.2176 },
  { name: "Moga", lat: 30.8160, lng: 75.1720 },
  { name: "Sangrur", lat: 30.2430, lng: 75.8400 },
  { name: "Patiala", lat: 30.3398, lng: 76.3869 },
  { name: "Amritsar", lat: 31.6340, lng: 74.8723 },
  { name: "Bathinda", lat: 30.2110, lng: 74.9455 },
  { name: "Ferozepur", lat: 30.9330, lng: 74.6160 },
  { name: "Barnala", lat: 30.3700, lng: 75.5500 },
  { name: "Fazilka", lat: 30.4040, lng: 74.0280 },
  { name: "Hoshiarpur", lat: 31.5200, lng: 75.9800 },
  { name: "Kapurthala", lat: 31.3800, lng: 75.3800 },
  { name: "Rupnagar", lat: 30.9700, lng: 76.5300 },
  { name: "Nawanshahr", lat: 31.1200, lng: 76.1300 },
];

function nearestBlock(lat: number, lng: number): string {
  let best = BLOCKS[0];
  let bestD = Infinity;
  for (const b of BLOCKS) {
    const d = (b.lat - lat) ** 2 + (b.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best.name;
}

function ClientMapView(props: React.ComponentProps<typeof MapView>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="panel h-full flex items-center justify-center text-muted-foreground text-sm">Loading map…</div>;
  return (
    <Suspense fallback={<div className="panel h-full flex items-center justify-center text-muted-foreground text-sm">Loading map…</div>}>
      <MapView {...props} />
    </Suspense>
  );
}

function Dashboard() {
  const { profile } = Route.useLoaderData();
  const [liveFires, setLiveFires] = useState<LiveFire[]>([]);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [firesLive, setFiresLive] = useState(false);
  const [firesSource, setFiresSource] = useState<string>("");
  const [maskEnabled, setMaskEnabled] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, FireStatus>>({});
  const fetchFires = useServerFn(getActiveFires);
  const fetchStatus = useServerFn(getGeeStatus);
  const fetchTiles = useServerFn(getTileLayers);
  const [diag, setDiag] = useState<any>(null);
  const [tiles, setTiles] = useState<{ id: "nbr" | "cropland"; label: string; tileUrl: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    fetchStatus().then((s) => { if (mounted) setDiag(s); }).catch(() => {});
    fetchFires().then((r) => {
      if (!mounted) return;
      const enriched: LiveFire[] = r.fires
        .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng))
        .map((f) => ({ ...f, block: nearestBlock(f.lat, f.lng) }));
      setLiveFires(enriched);
      setFiresLive(r.live);
      setFiresSource(r.source);
    }).catch(() => {});
    fetchTiles().then((r) => { if (mounted) setTiles(r.layers); }).catch(() => {});
    return () => { mounted = false; };
  }, [fetchFires, fetchStatus, fetchTiles]);

  const fires = liveFires;

  const mask = useCroplandMask(fires);
  const industrial = useIndustrialMask(fires);
  const suppressedIds = useMemo(() => {
    const s = new Set<string>();
    if (mask.ready && mask.ok) for (const id of mask.suppressedIds) s.add(id);
    for (const id of industrial.suppressedIds) s.add(id);
    return s;
  }, [mask, industrial]);
  const visibleFires = useMemo(
    () => (maskEnabled ? fires.filter((f) => !suppressedIds.has(f.id)) : fires),
    [fires, suppressedIds, maskEnabled],
  );
  const maskStatus: "live" | "loading" | "offline" = !maskEnabled
    ? "offline"
    : mask.loading || industrial.loading
      ? "loading"
      : industrial.ok || (mask.ready && mask.ok)
        ? "live"
        : "offline";
  const outcome = useMemo(() => {
    let verified = 0;
    let falseAlarms = 0;
    for (const f of visibleFires) {
      const st = statuses[f.id];
      if (st === "verified") verified += 1;
      else if (st === "false_alarm") falseAlarms += 1;
    }
    return { verified, falseAlarms, pending: visibleFires.length - verified - falseAlarms };
  }, [visibleFires, statuses]);

  const suppressedCount = maskEnabled ? suppressedIds.size : 0;
  const nbrTile = useMemo(() => tiles.find((t) => t.id === "nbr")?.tileUrl, [tiles]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader
        email={profile?.email ?? null}
        telegramHandle={profile?.telegram_handle ?? null}
        dispatchCount={dispatchCount}
        fires={visibleFires}
        firmsLive={firesLive}
        suppressedCount={suppressedCount}
        maskReady={maskEnabled && (mask.ready && mask.ok || industrial.ok)}
        outcome={outcome}
      />
      <main className="mx-auto max-w-[1600px] px-5 py-4 space-y-4">
        <section className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 h-[520px] lg:h-[calc(100vh-330px)] lg:min-h-[560px]">
            <ClientMapView
              fires={visibleFires}
              live={firesLive}
              source={firesSource}
              tiles={tiles}
              diag={diag}
              maskStatus={maskStatus}
              onCroplandToggle={setMaskEnabled}
              industrialGeoJson={industrial.geojson}
            />
          </div>
          <div className="lg:col-span-2 h-[520px] lg:h-[calc(100vh-330px)] lg:min-h-[560px]">
            <DispatchFeed
              fires={visibleFires}
                live={firesLive}
              places={mask.places}
              statuses={statuses}
              onStatusChange={(id, status) => setStatuses((s) => ({ ...s, [id]: status }))}
              onDispatched={() => setDispatchCount((c) => c + 1)}
              tileUrl={nbrTile}
            />
          </div>
        </section>

        <section className="h-[340px] pb-4">
          <HourlyChart fires={visibleFires} />
        </section>
      </main>
      <OfficerOnboardingModal />
    </div>
  );
}
