import { BarChart3, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

const DATA = Array.from({ length: 24 }, (_, h) => {
  const base: Record<number, number> = {
    5: 6, 6: 9, 7: 12, 8: 14, 9: 11, 10: 8, 11: 5, 12: 4, 13: 3, 14: 4, 15: 6, 16: 18,
    17: 142, 18: 88, 19: 41, 20: 22, 21: 14, 22: 18, 23: 34, 0: 118, 1: 62, 2: 24, 3: 9, 4: 5,
  };
  return { hour: h, label: `${String(h).padStart(2, "0")}:00`, count: base[h] ?? 4 };
});

function barColor(h: number, v: number) {
  if (h === 17 || h === 0) return "oklch(0.65 0.24 25)";
  if (v >= 40) return "oklch(0.82 0.17 80)";
  return "oklch(0.78 0.18 155)";
}

export function HourlyChart() {
  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">EVASION PATTERN · IGNITIONS BY HOUR</h2>
        </div>
        <div className="flex items-center gap-3 text-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[oklch(0.65_0.24_25)]" /> Evasion peak</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[oklch(0.82_0.17_80)]" /> Elevated</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[oklch(0.78_0.18_155)]" /> Baseline</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_220px]">
        <div className="relative h-[260px] rounded-md bg-[oklch(0.205_0.025_252)] p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DATA} margin={{ top: 16, right: 8, bottom: 6, left: -10 }}>
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
                axisLine={false} tickLine={false} width={36}
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
              <ReferenceLine y={50} stroke="oklch(0.82 0.17 80 / 0.4)" strokeDasharray="3 3" />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {DATA.map((d) => (
                  <Cell key={d.hour} fill={barColor(d.hour, d.count)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-[oklch(0.65_0.24_25/0.4)] bg-[oklch(0.65_0.24_25/0.08)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[oklch(0.78_0.22_25)] font-bold">
              <TrendingUp className="h-3 w-3" /> 17:00 IST SPIKE
            </div>
            <div className="text-mono mt-1 text-2xl font-bold text-foreground">142</div>
            <p className="text-[11px] text-muted-foreground">Post-patrol evasion window. <span className="text-foreground">8.4×</span> baseline.</p>
          </div>
          <div className="rounded-md border border-[oklch(0.65_0.24_25/0.4)] bg-[oklch(0.65_0.24_25/0.08)] p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[oklch(0.78_0.22_25)] font-bold">
              <TrendingUp className="h-3 w-3" /> 00:00 IST SPIKE
            </div>
            <div className="text-mono mt-1 text-2xl font-bold text-foreground">118</div>
            <p className="text-[11px] text-muted-foreground">Midnight cover-of-darkness pattern. <span className="text-foreground">7.0×</span> baseline.</p>
          </div>
          <div className="rounded-md border border-border bg-accent/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">7-day total</div>
            <div className="text-mono mt-1 text-2xl font-bold text-foreground">2,847</div>
            <p className="text-[11px] text-muted-foreground">Filtered against ESA WorldCover.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
