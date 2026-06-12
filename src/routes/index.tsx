import { useEffect, useState, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import type { LiveFire } from "@/components/dashboard/MapView";
import { DispatchFeed } from "@/components/dashboard/DispatchFeed";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { SystemConsole } from "@/components/dashboard/SystemConsole";
import { getActiveFires, getGeeStatus, getTileLayers } from "@/lib/gee.functions";

const MapView = lazy(() => import("@/components/dashboard/MapView").then((m) => ({ default: m.MapView })));

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "TSDR Command & Control · Karimnagar Wildfire Intelligence" },
      { name: "description", content: "Telangana State Disaster Response tactical dashboard for real-time NASA FIRMS detections, Sentinel-2 burn-scar overlays, and field dispatch across the Karimnagar sector." },
    ],
  }),
});

// Nearest known block label for a given lat/lng (rough, dispatch-grade)
// Test focus blocks — Karimnagar/Telangana sector around 18.15351, 79.5154
const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Karimnagar", lat: 18.4386, lng: 79.1288 },
  { name: "Huzurabad", lat: 18.1933, lng: 79.4042 },
  { name: "Jammikunta", lat: 18.2789, lng: 79.4736 },
  { name: "Husnabad", lat: 18.1351, lng: 79.5154 },
  { name: "Sircilla", lat: 18.3878, lng: 78.8106 },
  { name: "Peddapalli", lat: 18.6147, lng: 79.3744 },
  { name: "Warangal", lat: 17.9784, lng: 79.6004 },
  { name: "Hanamkonda", lat: 18.0079, lng: 79.5685 },
  { name: "Siddipet", lat: 18.1018, lng: 78.8520 },
  { name: "Jagtial", lat: 18.7895, lng: 78.9120 },
  { name: "Mancherial", lat: 18.8714, lng: 79.4441 },
  { name: "Nizamabad", lat: 18.6725, lng: 78.0941 },
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { name: "Khammam", lat: 17.2473, lng: 80.1514 },
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

function Dashboard() {
  const [fires, setFires] = useState<LiveFire[]>([]);
  const [firesLive, setFiresLive] = useState(false);
  const [firesSource, setFiresSource] = useState<string>("");
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
      const enriched: LiveFire[] = r.fires.map((f) => ({
        ...f,
        block: nearestBlock(f.lat, f.lng),
      }));
      setFires(enriched);
      setFiresLive(r.live);
      setFiresSource(r.source);
    }).catch(() => {});
    fetchTiles().then((r) => { if (mounted) setTiles(r.layers); }).catch(() => {});
    return () => { mounted = false; };
  }, [fetchFires, fetchStatus, fetchTiles]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader />
      <main className="mx-auto max-w-[1600px] px-5 py-4 space-y-4">
        <section className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 h-[560px]">
            <MapView fires={fires} live={firesLive} source={firesSource} tiles={tiles} diag={diag} />
          </div>
          <div className="lg:col-span-2 h-[560px]">
            <DispatchFeed fires={fires} live={firesLive} />
          </div>
        </section>

        <section className="h-[340px]">
          <HourlyChart />
        </section>

        <section className="h-[280px] pb-4">
          <SystemConsole />
        </section>
      </main>
    </div>
  );
}
