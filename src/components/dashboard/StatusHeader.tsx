import { Activity, Satellite, Radar, Cog, ShieldAlert, Filter, Truck, Radio } from "lucide-react";

function Pill({ tone, children }: { tone: "emerald" | "amber" | "slate" | "crimson"; children: React.ReactNode }) {
  const map = {
    emerald: "bg-[oklch(0.78_0.18_155/0.12)] text-[oklch(0.85_0.18_155)] border-[oklch(0.78_0.18_155/0.4)]",
    amber: "bg-[oklch(0.82_0.17_80/0.12)] text-[oklch(0.88_0.17_80)] border-[oklch(0.82_0.17_80/0.4)]",
    slate: "bg-muted/40 text-muted-foreground border-border",
    crimson: "bg-[oklch(0.65_0.24_25/0.12)] text-[oklch(0.78_0.22_25)] border-[oklch(0.65_0.24_25/0.4)]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[tone]}`}>
      {children}
    </span>
  );
}

function SystemTile({
  icon: Icon, label, value, tone,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone: "emerald" | "amber" | "slate" | "crimson" }) {
  const dotMap = {
    emerald: "bg-[oklch(0.78_0.18_155)] shadow-[0_0_12px_oklch(0.78_0.18_155/0.8)]",
    amber: "bg-[oklch(0.82_0.17_80)] shadow-[0_0_12px_oklch(0.82_0.17_80/0.8)]",
    slate: "bg-muted-foreground",
    crimson: "bg-[oklch(0.65_0.24_25)] shadow-[0_0_12px_oklch(0.65_0.24_25/0.8)]",
  };
  return (
    <div className="panel flex items-center gap-3 px-3 py-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/60 border border-border">
        <Icon className="h-4 w-4 text-foreground/80" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dotMap[tone]} ${tone !== "slate" ? "ticker" : ""}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        </div>
        <div className="text-mono text-sm font-semibold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function Counter({ icon: Icon, label, value, tone, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: "emerald" | "amber" | "crimson"; sub: string }) {
  const ring = { emerald: "glow-emerald", amber: "glow-amber", crimson: "glow-crimson" }[tone];
  const text = {
    emerald: "text-[oklch(0.85_0.18_155)]",
    amber: "text-[oklch(0.88_0.17_80)]",
    crimson: "text-[oklch(0.78_0.22_25)]",
  }[tone];
  return (
    <div className={`panel relative overflow-hidden px-4 py-3 ${ring}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className={`text-mono mt-1 text-3xl font-bold leading-none ${text}`}>{value}</div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div>
        </div>
        <Icon className={`h-5 w-5 ${text}`} />
      </div>
    </div>
  );
}

export function StatusHeader() {
  return (
    <header className="border-b border-border bg-panel/60 backdrop-blur-md">
      <div className="mx-auto max-w-[1600px] px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 border border-primary/40 glow-emerald">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wide text-foreground">TSDR · COMMAND & CONTROL</h1>
                <Pill tone="emerald"><span className="h-1.5 w-1.5 rounded-full bg-current ticker" />OPERATIONAL</Pill>
              </div>
              <p className="text-[11px] text-muted-foreground text-mono">
                Telangana State Disaster Response · Stubble & Wildfire Intelligence Grid · Karimnagar Sector
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-mono text-[11px] text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span>OPERATOR: <span className="text-foreground">INSP. R. SANDHU</span></span>
            <span className="opacity-40">|</span>
            <span>STATION: <span className="text-foreground">KNR-CMD-01</span></span>
            <span className="opacity-40">|</span>
            <span className="text-foreground" id="utc-clock">--:--:-- IST</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-7">
          <div className="lg:col-span-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SystemTile icon={Activity} label="Thermal · FIRMS" value="LIVE 24/7" tone="emerald" />
            <SystemTile icon={Satellite} label="Optical · Sentinel-2" value="Pass 11:30 AM" tone="amber" />
            <SystemTile icon={Radar} label="Radar · Sentinel-1" value="STANDBY" tone="slate" />
            <SystemTile icon={Cog} label="Automation · CRON" value="ACTIVE" tone="emerald" />
          </div>
          <div className="lg:col-span-3 grid grid-cols-3 gap-2">
            <Counter icon={ShieldAlert} label="Active Alerts Today" value="27" tone="crimson" sub="+6 last hour" />
            <Counter icon={Filter} label="False+ Suppressed" value="184" tone="amber" sub="ESA Cropland mask" />
            <Counter icon={Truck} label="Patrol Units Dispatched" value="12" tone="emerald" sub="9 en route · 3 on-site" />
          </div>
        </div>
      </div>
    </header>
  );
}
