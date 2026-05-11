import { useEffect, useRef, useState } from "react";
import { Terminal, Circle } from "lucide-react";

type LogLevel = "ok" | "info" | "warn" | "err";
type LogEntry = { ts: string; level: LogLevel; src: string; msg: string };

const SEED: LogEntry[] = [
  { ts: "00:42:18", level: "ok",   src: "AUTH",     msg: "Service Account authenticated successfully (gee-ppf-bot@punjab-firmap.iam)" },
  { ts: "00:42:19", level: "info", src: "FIRMS",    msg: "Polling NASA FIRMS VIIRS_SNPP_NRT · bbox=[74.4,30.4,76.6,31.4]" },
  { ts: "00:42:21", level: "ok",   src: "FIRMS",    msg: "Received 47 thermal anomalies · 200 OK · 312ms" },
  { ts: "00:42:21", level: "info", src: "MASK",     msg: "Cropland filter applied to 42,000 pixels (ESA WorldCover v200)" },
  { ts: "00:42:22", level: "warn", src: "MASK",     msg: "Suppressed 19 anomalies outside cropland geometry" },
  { ts: "00:42:23", level: "ok",   src: "GEE",      msg: "Sentinel-2 NBR computed for tile 43R-EQ-04 (cloud cover 6%)" },
  { ts: "00:42:25", level: "info", src: "DISPATCH", msg: "Routing FRM-2841 to PS-Jagraon · ETA 14m via NH-05" },
  { ts: "00:42:26", level: "ok",   src: "TG-BOT",   msg: "Telegram alert delivered to @ppf_ldh_dispatch · msg_id=88421" },
  { ts: "00:42:27", level: "info", src: "CRON",     msg: "Next scan scheduled @ 00:47:00 IST (5 min interval)" },
  { ts: "00:42:30", level: "info", src: "FIRMS",    msg: "No thermal anomalies detected in last scan · sector LDH-N3" },
];

const STREAM: Omit<LogEntry, "ts">[] = [
  { level: "ok",   src: "GEE",      msg: "Sentinel-1 SAR backscatter coregistered for slice 22A" },
  { level: "info", src: "MASK",     msg: "Verified ESA Cropland intersection · 31 candidates retained" },
  { level: "ok",   src: "FIRMS",    msg: "VIIRS pass acquired · 12 hotspots above 70% confidence" },
  { level: "warn", src: "MASK",     msg: "Suppressed 4 false positives near Bhakra canal (water mask)" },
  { level: "ok",   src: "DISPATCH", msg: "Patrol unit LDH-PT-09 acknowledged FRM-2842" },
  { level: "info", src: "TG-BOT",   msg: "Heartbeat OK · 124 subscribers active in dispatch channel" },
  { level: "ok",   src: "CRON",     msg: "Cycle complete · 1.84s · 0 errors" },
  { level: "err",  src: "GEE",      msg: "Retrying tile 43R-EQ-07 (HTTP 429) · backoff 800ms" },
  { level: "ok",   src: "AUTH",     msg: "Token refreshed · expires in 3540s" },
  { level: "info", src: "FIRMS",    msg: "Aqua/MODIS passes queued · arrival 13:42 IST" },
];

const levelColor: Record<LogLevel, string> = {
  ok:   "text-[oklch(0.85_0.18_155)]",
  info: "text-[oklch(0.75_0.05_252)]",
  warn: "text-[oklch(0.88_0.17_80)]",
  err:  "text-[oklch(0.78_0.22_25)]",
};

function nowTs() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
}

export function SystemConsole() {
  const [logs, setLogs] = useState<LogEntry[]>(SEED);
  const [tick, setTick] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTick(nowTs());
    const tk = setInterval(() => setTick(nowTs()), 1000);
    let i = 0;
    const t = setInterval(() => {
      const next = STREAM[i % STREAM.length];
      i++;
      setLogs((prev) => {
        const out = [...prev, { ...next, ts: nowTs() }];
        return out.slice(-60);
      });
    }, 1800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [logs]);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">AUTONOMOUS SYSTEM CONSOLE</h2>
        </div>
        <div className="flex items-center gap-3 text-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Circle className="h-2 w-2 fill-current text-[oklch(0.85_0.18_155)]" /> 5 services</span>
          <span>0 errors · uptime 14d 02h</span>
        </div>
      </div>
      <div ref={ref} className="relative flex-1 overflow-y-auto bg-[oklch(0.16_0.025_252)] p-3 text-mono text-[11px] leading-relaxed scanlines">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-3 hover:bg-accent/20 px-1 -mx-1 rounded">
            <span className="text-muted-foreground shrink-0">{l.ts}</span>
            <span className={`shrink-0 w-12 font-bold ${levelColor[l.level]}`}>[{l.level.toUpperCase()}]</span>
            <span className="shrink-0 w-16 text-[oklch(0.78_0.10_220)]">{l.src}</span>
            <span className="text-foreground/90">{l.msg}</span>
          </div>
        ))}
        <div className="flex gap-3 px-1 -mx-1">
          <span className="text-muted-foreground">{nowTs()}</span>
          <span className="text-primary ticker">▌</span>
          <span className="text-muted-foreground">awaiting next CRON tick…</span>
        </div>
      </div>
    </div>
  );
}
