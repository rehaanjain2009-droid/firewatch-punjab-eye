import { createFileRoute } from "@tanstack/react-router";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import { MapView } from "@/components/dashboard/MapView";
import { DispatchFeed } from "@/components/dashboard/DispatchFeed";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { SystemConsole } from "@/components/dashboard/SystemConsole";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "PPF Command & Control · Stubble Fire Intelligence" },
      { name: "description", content: "Punjab Police & Forestry tactical dashboard for real-time monitoring and dispatch on illegal agricultural stubble fires across the Ludhiana sector." },
    ],
  }),
});

function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader />
      <main className="mx-auto max-w-[1600px] px-5 py-4 space-y-4">
        <section className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 h-[560px]">
            <MapView />
          </div>
          <div className="lg:col-span-2 h-[560px]">
            <DispatchFeed />
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
