import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import { MapView, type LiveFire } from "@/components/dashboard/MapView";
import { DispatchFeed } from "@/components/dashboard/DispatchFeed";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { SystemConsole } from "@/components/dashboard/SystemConsole";
import { getActiveFires, getGeeStatus, getTileLayers } from "@/lib/gee.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "PPF Command & Control · Stubble Fire Intelligence" },
      { name: "description", content: "Punjab Police & Forestry tactical dashboard for real-time monitoring and dispatch on illegal agricultural stubble fires across the Ludhiana sector." },
    ],
  }),
});

// Nearest known block label for a given lat/lng (rough, dispatch-grade)
const BLOCKS: { name: string; lat: number; lng: number }[] = [
  { name: "Jagraon", lat: 30.7892, lng: 75.4731 },
  { name: "Sidhwan Bet", lat: 30.9118, lng: 75.5740 },
  { name: "Mullanpur Dakha", lat: 30.8642, lng: 75.6711 },
  { name: "Raikot", lat: 30.6491, lng: 75.6055 },
  { name: "Samrala", lat: 30.8348, lng: 76.1929 },
  { name: "Khanna", lat: 30.7038, lng: 76.2215 },
  { name: "Payal", lat: 30.6996, lng: 76.0518 },
  { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
  { name: "Moga", lat: 30.8160, lng: 75.1700 },
  { name: "Barnala", lat: 30.3782, lng: 75.5460 },
  { name: "Patiala", lat: 30.3398, lng: 76.3869 },
  { name: "Sangrur", lat: 30.2458, lng: 75.8421 },
  { name: "Bathinda", lat: 30.2110, lng: 74.9455 },
  { name: "Amritsar", lat: 31.6340, lng: 74.8723 },
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
