import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Flame, Zap, ShieldCheck, Truck, ShieldAlert, Radio, LogOut, User, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TELEGRAM_DISPATCH_URL } from "@/components/dashboard/OfficerOnboardingModal";
import type { LiveFire } from "@/components/dashboard/MapView";

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

type Props = { email?: string | null; telegramHandle?: string | null; dispatchCount?: number; fires?: LiveFire[]; firmsLive?: boolean; suppressedCount?: number; maskReady?: boolean };

export function StatusHeader({ email, telegramHandle, dispatchCount = 0, fires = [], firmsLive = false, suppressedCount = 0, maskReady = false }: Props = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { total, peakFrp, highConfidence } = useMemo(() => {
    const total = fires.length;
    let peak = 0;
    let high = 0;
    for (const f of fires) {
      if (Number.isFinite(f.frp) && f.frp > peak) peak = f.frp;
      if (Number.isFinite(f.confidence) && f.confidence >= 80) high += 1;
    }
    return { total, peakFrp: peak, highConfidence: high };
  }, [fires]);

  useEffect(() => {
    const i = setInterval(() => {
      const el = document.getElementById("utc-clock");
      if (el) el.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false }) + " IST";
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const signOut = async () => {
    setBusy(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } finally {
      setBusy(false);
    }
  };

  const peakValue = total === 0 ? "— MW" : `${peakFrp.toFixed(1)} MW`;

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
                <h1 className="text-sm font-bold tracking-wide text-foreground">PPF · COMMAND & CONTROL</h1>
                <Pill tone="emerald"><span className="h-1.5 w-1.5 rounded-full bg-current ticker" />OPERATIONAL</Pill>
              </div>
              <p className="text-[11px] text-muted-foreground text-mono">
                Punjab Pollution Control · Stubble & Wildfire Intelligence Grid · Ludhiana Sector
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-mono text-[11px] text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-primary hidden md:block" />
            {email && (
              <span className="hidden md:inline-flex items-center gap-1.5 rounded border border-border bg-accent/40 px-2 py-1 text-foreground">
                <User className="h-3 w-3" /> {email}
                {telegramHandle && <span className="text-muted-foreground">· @{telegramHandle}</span>}
              </span>
            )}
            <span className="hidden lg:inline text-foreground" id="utc-clock">--:--:-- IST</span>
            <a
              href={TELEGRAM_DISPATCH_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-1 font-semibold uppercase tracking-wider text-primary hover:bg-primary/20"
            >
              <Send className="h-3 w-3" /> <span className="hidden sm:inline">Join Telegram</span>
            </a>
            <button
              onClick={signOut}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-accent/40 px-2 py-1 font-semibold uppercase tracking-wider text-foreground hover:border-primary/40 hover:bg-accent disabled:opacity-60"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Counter icon={Activity} label="Thermal · FIRMS" value={firmsLive ? "LIVE" : "OFFLINE"} tone={firmsLive ? "emerald" : "amber"} sub="NASA FIRMS uplink" />
          <Counter icon={Flame} label="Total Thermal Anomalies" value={String(total)} tone="crimson" sub="Active FIRMS detections" />
          <Counter icon={Zap} label="Peak Intensity · Max FRP" value={peakValue} tone="amber" sub="Fire Radiative Power" />
          <Counter icon={ShieldCheck} label="High Confidence Detections" value={String(highConfidence)} tone="crimson" sub="Confidence ≥ 80%" />
          <Counter icon={ShieldAlert} label="Urban Fires Detected" value={maskReady ? String(suppressedCount) : "—"} tone="amber" sub="Suppressed by ESA mask" />
          <Counter icon={Truck} label="Alerts Dispatched" value={String(dispatchCount)} tone="emerald" sub="Session dispatches" />

        </div>
      </div>
    </header>
  );
}
