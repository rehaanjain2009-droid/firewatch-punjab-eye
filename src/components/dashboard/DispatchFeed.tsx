import { useState } from "react";
import { Copy, Send, Clock, AlertTriangle, Radio, Check } from "lucide-react";

type Alert = {
  id: string;
  block: string;
  sector: string;
  confidence: number;
  detected: string;
  evasion?: "evening" | "midnight";
  lat: number;
  lng: number;
  status: "new" | "ack" | "dispatched";
};

const ALERTS: Alert[] = [
  { id: "FRM-2841", block: "Jagraon", sector: "Khet 14-B", confidence: 94, detected: "17:04 IST", evasion: "evening", lat: 30.7892, lng: 75.4731, status: "new" },
  { id: "FRM-2847", block: "Sidhwan Bet", sector: "Khet 8", confidence: 91, detected: "17:08 IST", evasion: "evening", lat: 30.9118, lng: 75.5740, status: "new" },
  { id: "FRM-2842", block: "Khanna", sector: "Sector 7", confidence: 88, detected: "17:11 IST", evasion: "evening", lat: 30.7038, lng: 76.2215, status: "ack" },
  { id: "FRM-2844", block: "Mullanpur Dakha", sector: "Block 22", confidence: 82, detected: "16:52 IST", lat: 30.8642, lng: 75.6711, status: "dispatched" },
  { id: "FRM-2843", block: "Raikot", sector: "Plot 9-A", confidence: 71, detected: "00:18 IST", evasion: "midnight", lat: 30.6491, lng: 75.6055, status: "new" },
  { id: "FRM-2845", block: "Samrala", sector: "Field K-3", confidence: 67, detected: "23:47 IST", evasion: "midnight", lat: 30.8348, lng: 76.1929, status: "ack" },
  { id: "FRM-2846", block: "Payal", sector: "Sector 3", confidence: 58, detected: "17:22 IST", evasion: "evening", lat: 30.6996, lng: 76.0518, status: "new" },
];

function confTone(c: number) {
  if (c >= 85) return { label: "CRITICAL", cls: "text-[oklch(0.78_0.22_25)] bg-[oklch(0.65_0.24_25/0.12)] border-[oklch(0.65_0.24_25/0.5)]" };
  if (c >= 70) return { label: "HIGH", cls: "text-[oklch(0.88_0.17_80)] bg-[oklch(0.82_0.17_80/0.12)] border-[oklch(0.82_0.17_80/0.5)]" };
  return { label: "REVIEW", cls: "text-[oklch(0.85_0.18_155)] bg-[oklch(0.78_0.18_155/0.10)] border-[oklch(0.78_0.18_155/0.4)]" };
}

function statusPill(s: Alert["status"]) {
  if (s === "new") return <span className="text-mono text-[9px] uppercase tracking-wider text-[oklch(0.78_0.22_25)]">● NEW</span>;
  if (s === "ack") return <span className="text-mono text-[9px] uppercase tracking-wider text-[oklch(0.88_0.17_80)]">● ACK</span>;
  return <span className="text-mono text-[9px] uppercase tracking-wider text-[oklch(0.85_0.18_155)]">● DISPATCHED</span>;
}

export function DispatchFeed() {
  const [copied, setCopied] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<Set<string>>(new Set(["FRM-2844"]));

  const handleCopy = (a: Alert) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}&travelmode=driving`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(a.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const handleDispatch = (a: Alert) => {
    setDispatched((s) => new Set(s).add(a.id));
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">DISPATCH FEED · LIVE</h2>
        </div>
        <div className="text-mono text-[10px] text-muted-foreground">
          <span className="text-[oklch(0.78_0.22_25)] ticker">●</span> {ALERTS.filter(a => a.status === "new").length} UNHANDLED
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {ALERTS.map((a) => {
          const t = confTone(a.confidence);
          const isDispatched = dispatched.has(a.id) || a.status === "dispatched";
          return (
            <article
              key={a.id}
              className="rounded-md border border-border bg-[oklch(0.215_0.022_252)] p-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-mono text-[10px] font-bold tracking-wider rounded border px-1.5 py-0.5 ${t.cls}`}>
                      {a.confidence}% · {t.label}
                    </span>
                    {a.evasion && (
                      <span className="inline-flex items-center gap-1 text-mono text-[9px] uppercase tracking-wider text-[oklch(0.88_0.17_80)]">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {a.evasion === "evening" ? "17:00 EVASION" : "MIDNIGHT EVASION"}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-sm font-bold text-foreground leading-tight">
                    {a.block} <span className="text-muted-foreground font-normal">· {a.sector}</span>
                  </h3>
                  <div className="mt-0.5 flex items-center gap-2 text-mono text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {a.detected}
                    <span className="opacity-40">|</span>
                    <span>{a.lat.toFixed(4)}, {a.lng.toFixed(4)}</span>
                    <span className="opacity-40">|</span>
                    {statusPill(isDispatched ? "dispatched" : a.status)}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopy(a)}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent hover:border-primary/40"
                >
                  {copied === a.id ? <><Check className="h-3.5 w-3.5 text-primary" /> Route copied</> : <><Copy className="h-3.5 w-3.5" /> Copy GMaps Route</>}
                </button>
                <button
                  onClick={() => handleDispatch(a)}
                  disabled={isDispatched}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold transition-opacity ${
                    isDispatched
                      ? "bg-[oklch(0.78_0.18_155/0.15)] text-[oklch(0.85_0.18_155)] border border-[oklch(0.78_0.18_155/0.4)] cursor-default"
                      : "bg-[oklch(0.65_0.24_25)] text-white hover:opacity-90 glow-crimson"
                  }`}
                >
                  {isDispatched ? <><Check className="h-3.5 w-3.5" /> Dispatched</> : <><Send className="h-3.5 w-3.5" /> Force Telegram Dispatch</>}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
