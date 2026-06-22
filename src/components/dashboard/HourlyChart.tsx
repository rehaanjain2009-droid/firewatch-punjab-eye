import { useMemo } from "react";
import { BarChart3, Flame } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import type { LiveFire } from "./MapView";

type Props = { fires: LiveFire[] };

function parseHour(acqTime: string): number | null {
  if (!acqTime) return null;
  const padded = acqTime.padStart(4, "0");
  const h = Number(padded.slice(0, 2));
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

export function HourlyChart({ fires }: Props) {
  const { data, total, max } = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, "0")}:00`, count: 0 }));
    let t = 0;
    for (const f of fires) {
      const h = parseHour(f.acqTime);
      if (h === null) continue;
      buckets[h].count += 1;
      t += 1;
    }
    const m = buckets.reduce((acc, b) => Math.max(acc, b.count), 0);
    return { data: buckets, total: t, max: m };
  }, [fires]);

  const barColor = (v: number) => {
    if (max === 0) return "oklch(0.78 0.18 155)";
    if (v === max) return "oklch(0.65 0.24 25)";
    if (v >= max * 0.5) return "oklch(0.82 0.17 80)";
    return "oklch(0.78 0.18 155)";
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">IGNITIONS BY HOUR · NASA FIRMS (LIVE)</h2>
        </div>
        <div className="text-mono text-[10px] text-muted-foreground">
          Plotted ignitions: <span className="text-foreground">{total}</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_220px]">
        <div className="relative h-[260px] rounded-md bg-[oklch(0.205_0.025_252)] p-2">
          {total === 0 ? (
            <div className="flex h-full items-center justify-center text-mono text-[11px] text-muted-foreground">
              Awaiting FIRMS uplink — no ignitions to plot
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 8, bottom: 6, left: -10 }}>
                <CartesianGrid stroke="oklch(0.32 0.025 252 / 0.4)" vertical={false} strokeDasharray="2 4" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "oklch(0.70 0.02 252)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={{ stroke: "oklch(0.32 0.025 252)" }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fill: "oklch(0.70 0.02 252)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} width={36} allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "oklch(0.32 0.025 252 / 0.4)" }}
                  contentStyle={{
                    background: "oklch(0.22 0.025 252)",
                    border: "1px solid oklch(0.32 0.025 252)",
                    borderRadius: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                    color: "oklch(0.98 0.005 250)",
                  }}
                  labelStyle={{ color: "oklch(0.85 0.18 155)" }}
                  formatter={(v: number) => [`${v} ignitions`, ""]}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.map((d) => (
                    <Cell key={d.hour} fill={barColor(d.count)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-border bg-accent/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Flame className="h-3 w-3" /> Plotted ignitions
            </div>
            <div className="text-mono mt-1 text-3xl font-bold text-foreground">{total}</div>
            <p className="text-[11px] text-muted-foreground">From live NASA FIRMS acq_time.</p>
          </div>
          <div className="rounded-md border border-border bg-accent/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Peak hour</div>
            <div className="text-mono mt-1 text-2xl font-bold text-foreground">
              {max === 0 ? "—" : `${String(data.find((d) => d.count === max)!.hour).padStart(2, "0")}:00`}
            </div>
            <p className="text-[11px] text-muted-foreground">{max === 0 ? "No ignitions yet." : `${max} ignitions in peak bucket.`}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
