import { useEffect, useState, lazy, Suspense, useMemo, useRef } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import type { LiveFire } from "@/components/dashboard/MapView";
import { DispatchFeed, type FireStatus } from "@/components/dashboard/DispatchFeed";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { OfficerOnboardingModal } from "@/components/dashboard/OfficerOnboardingModal";
import { getActiveFires, getGeeStatus, getTileLayers, dispatchTelegram } from "@/lib/gee.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { syncIncidents, updateIncident } from "@/lib/incidents.functions";
import { incidentKey } from "@/lib/officerMatch";
import { useOfficerAssignments } from "@/hooks/useOfficerDirectory";
import { useCroplandMask } from "@/hooks/useCroplandMask";
import { useIndustrialMask } from "@/hooks/useIndustrialMask";
import { useWardMask } from "@/hooks/useWardMask";
import { shouldAutoDispatch } from "@/lib/landuseMask";

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
  const [firesLive, setFiresLive] = useState(false);
  const [firesSource, setFiresSource] = useState<string>("");
  const [maskEnabled, setMaskEnabled] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, FireStatus>>({});
  const fetchFires = useServerFn(getActiveFires);
  const fetchStatus = useServerFn(getGeeStatus);
  const fetchTiles = useServerFn(getTileLayers);
  const sendDispatch = useServerFn(dispatchTelegram);
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

  // Reverse-geocoded place labels only (e.g. "Farmland near Jagraon") — never suppresses.
  const mask = useCroplandMask(fires);
  const industrial = useIndustrialMask(fires);
  const ward = useWardMask(fires);

  // A fire is suppressed ONLY when it lies inside an exact OSM industrial /
  // brick-kiln polygon, or inside the MC Ludhiana ward core. Village
  // residential tags never mask. Farmland, forest and all other land stay active. The map's
  // mask toggle only hides the overlay — suppression always applies, matching
  // the hourly cron route.
  const suppressedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of ward.suppressedIds) s.add(id);
    for (const id of industrial.suppressedIds) s.add(id);
    return s;
  }, [ward, industrial]);

  const reasonById = useMemo(() => {
    const m = new Map<string, string>(industrial.reasonById);
    for (const [id, label] of ward.wardById) m.set(id, `MC ${label}`);
    return m;
  }, [ward, industrial]);

  // Only fires outside every mask remain "active" dispatch candidates.
  const activeFires = useMemo(
    () => fires.filter((f) => !suppressedIds.has(f.id)),
    [fires, suppressedIds],
  );

  const maskStatus: "live" | "loading" | "offline" = !maskEnabled
    ? "offline"
    : ward.loading || industrial.loading
      ? "loading"
      : ward.ready || industrial.ok
        ? "live"
        : "offline";

  const outcome = useMemo(() => {
    let verified = 0;
    let falseAlarms = 0;
    for (const f of activeFires) {
      const st = statuses[f.id];
      if (st === "verified") verified += 1;
      else if (st === "false_alarm") falseAlarms += 1;
    }
    return { verified, falseAlarms, pending: activeFires.length - verified - falseAlarms };
  }, [activeFires, statuses]);

  const suppressedCount = suppressedIds.size;
  const nbrTile = useMemo(() => tiles.find((t) => t.id === "nbr")?.tileUrl, [tiles]);

  const officers = useOfficerAssignments(activeFires);
  const syncFn = useServerFn(syncIncidents);
  const updateFn = useServerFn(updateIncident);

  // ------------------------------------------------------------------
  // Audit + autonomous dispatch pipeline. Once both masks have resolved,
  // every ACTIVE fire is written to the permanent incident log, then any
  // fire with confidence >= 70% that has never been dispatched is pushed to
  // Telegram. The database claim prevents double-sends with the hourly job.
  // ------------------------------------------------------------------
  const syncedRef = useRef<Set<string>>(new Set());
  const [dispatchedIds, setDispatchedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!firesLive || !ward.ready || !industrial.ready) return;
    const fresh = activeFires.filter((f) => !syncedRef.current.has(f.id));
    if (fresh.length === 0) return;
    for (const f of fresh) syncedRef.current.add(f.id);
    let cancelled = false;
    (async () => {
      const toInput = (f: LiveFire) => ({
        lat: f.lat, lng: f.lng, frp: f.frp, confidence: f.confidence,
        acqDate: f.acqDate, acqTime: f.acqTime, satellite: f.satellite,
        daynight: f.daynight, block: f.block,
      });
      let rows: { fire_key: string; status: string; dispatched_at: string | null }[] = [];
      try {
        rows = (await syncFn({ data: { fires: fresh.map(toInput) } })).incidents;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[audit] sync failed", (err as Error).message);
      }
      if (cancelled) return;
      const byKey = new Map(rows.map((r) => [r.fire_key, r]));
      const already = new Set<string>();
      const restored: Record<string, FireStatus> = {};
      for (const f of fresh) {
        const r = byKey.get(incidentKey(f));
        if (!r) continue;
        if (r.dispatched_at) already.add(f.id);
        if (r.status === "resolved") restored[f.id] = "verified";
        else if (r.status === "false_alarm") restored[f.id] = "false_alarm";
      }
      if (already.size) setDispatchedIds((s) => new Set([...s, ...already]));
      if (Object.keys(restored).length) setStatuses((s) => ({ ...restored, ...s }));

      const targets = fresh.filter((f) => shouldAutoDispatch(f.confidence) && !already.has(f.id));
      for (const f of targets) {
        try {
          const r = await sendDispatch({ data: { ...toInput(f), channel: "auto_dashboard" } });
          if (cancelled) return;
          if (r.ok) setDispatchedIds((s) => new Set(s).add(f.id));
          else console.warn("[auto-dispatch] telegram rejected", f.id, r.status, r.body);
        } catch (err) {
          if (!cancelled) console.warn("[auto-dispatch] failed", f.id, (err as Error).message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeFires, firesLive, ward.ready, industrial.ready, sendDispatch, syncFn]);

  const dispatchCount = useMemo(
    () => activeFires.filter((f) => dispatchedIds.has(f.id)).length,
    [activeFires, dispatchedIds],
  );

  const handleStatusChange = (id: string, status: FireStatus) => {
    setStatuses((s) => ({ ...s, [id]: status }));
    const f = activeFires.find((x) => x.id === id);
    if (!f) return;
    const dbStatus =
      status === "verified" ? "resolved" : status === "false_alarm" ? "false_alarm" : dispatchedIds.has(id) ? "dispatched" : "active";
    updateFn({ data: { fireKey: incidentKey(f), status: dbStatus } }).catch((err) =>
      console.warn("[audit] status update failed", (err as Error).message),
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader
        email={profile?.email ?? null}
        telegramHandle={profile?.telegram_handle ?? null}
        dispatchCount={dispatchCount}
        fires={activeFires}
        firmsLive={firesLive}
        suppressedCount={suppressedCount}
        maskReady={ward.ready || industrial.ok}
        outcome={outcome}
      />
      <main className="mx-auto max-w-[1600px] px-5 py-4 space-y-4">
        <section className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 h-[520px] lg:h-[calc(100vh-330px)] lg:min-h-[560px]">
            <ClientMapView
              fires={fires}
              live={firesLive}
              source={firesSource}
              tiles={tiles}
              diag={diag}
              maskStatus={maskStatus}
              onCroplandToggle={setMaskEnabled}
              industrialGeoJson={industrial.geojson}
              wardGeoJson={ward.geojson}
              wardCount={ward.count}
              suppressedIds={suppressedIds}
              wardById={reasonById}
            />
          </div>
          <div className="lg:col-span-2 h-[520px] lg:h-[calc(100vh-330px)] lg:min-h-[560px]">
            <DispatchFeed
              fires={activeFires}
              live={firesLive}
              places={mask.places}
              statuses={statuses}
              autoDispatched={dispatchedIds}
              assignments={officers.byId}
              onStatusChange={handleStatusChange}
              onDispatched={(id) => setDispatchedIds((s) => new Set(s).add(id))}
              tileUrl={nbrTile}
            />
          </div>
        </section>

        <section className="h-[340px] pb-4">
          <HourlyChart fires={activeFires} />
        </section>
      </main>
      <OfficerOnboardingModal />
    </div>
  );
}
