import { useState, useMemo } from "react";
import { Copy, Send, Clock, AlertTriangle, Radio, Check, Loader2, Satellite, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { dispatchTelegram } from "@/lib/gee.functions";
import type { LiveFire } from "./MapView";
import { BurnScarModal } from "./BurnScarModal";
import type { PlaceInfo } from "@/hooks/useCroplandMask";


function confTone(c: number) {
  if (c >= 80) return { label: "CRITICAL", cls: "text-[oklch(0.78_0.22_25)] bg-[oklch(0.65_0.24_25/0.12)] border-[oklch(0.65_0.24_25/0.5)]" };
  if (c >= 60) return { label: "HIGH", cls: "text-[oklch(0.88_0.17_80)] bg-[oklch(0.82_0.17_80/0.12)] border-[oklch(0.82_0.17_80/0.5)]" };
  return { label: "REVIEW", cls: "text-[oklch(0.85_0.18_155)] bg-[oklch(0.78_0.18_155/0.10)] border-[oklch(0.78_0.18_155/0.4)]" };
}

function evasionTag(acqTime: string): "evening" | "midnight" | null {
  if (!acqTime || acqTime.length < 3) return null;
  const padded = acqTime.padStart(4, "0");
  const h = Number(padded.slice(0, 2));
  if (h >= 16 && h <= 19) return "evening";
  if (h <= 4 || h === 23) return "midnight";
  return null;
}

export type FireStatus = "pending" | "verified" | "false_alarm";

type Props = {
  fires: LiveFire[];
  live: boolean;
  onDispatched?: () => void;
  places?: Map<string, PlaceInfo>;
  statuses?: Record<string, FireStatus>;
  onStatusChange?: (id: string, status: FireStatus) => void;
};

const STATUS_OPTIONS: { key: FireStatus; label: string; cls: string }[] = [
  { key: "pending", label: "Pending", cls: "bg-muted/60 text-foreground border-border" },
  { key: "verified", label: "Verified Burn", cls: "bg-[oklch(0.78_0.18_155/0.18)] text-[oklch(0.85_0.18_155)] border-[oklch(0.78_0.18_155/0.5)]" },
  { key: "false_alarm", label: "False Alarm", cls: "bg-[oklch(0.82_0.17_80/0.18)] text-[oklch(0.88_0.17_80)] border-[oklch(0.82_0.17_80/0.5)]" },
];

export function DispatchFeed({ fires, live, onDispatched, places, statuses, onStatusChange }: Props) {

  const [copied, setCopied] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [acked] = useState<Set<string>>(new Set());
  const [verifyFire, setVerifyFire] = useState<LiveFire | null>(null);
  const sendDispatch = useServerFn(dispatchTelegram);

  const sorted = useMemo(() => [...fires].sort((a, b) => (b.frp || 0) - (a.frp || 0)), [fires]);
  const unhandled = sorted.filter((f) => !dispatched.has(f.id) && !acked.has(f.id)).length;

  const gmapsUrl = (f: LiveFire): string | null => {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return null;
    return `https://www.google.com/maps?q=${f.lat},${f.lng}`;
  };

  const handleCopy = (f: LiveFire) => {
    const url = gmapsUrl(f);
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(f.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const handleDispatch = async (f: LiveFire) => {
    if (sending.has(f.id) || dispatched.has(f.id)) return;
    setSending((s) => new Set(s).add(f.id));
    setErrors((e) => { const n = { ...e }; delete n[f.id]; return n; });
    try {
      const r = await sendDispatch({
        data: {
          block: f.block,
          lat: f.lat,
          lng: f.lng,
          confidence: f.confidence,
          frp: f.frp,
          acqDate: f.acqDate,
          acqTime: f.acqTime,
          satellite: f.satellite,
        },
      });
      if (r.ok) {
        setDispatched((s) => {
          if (s.has(f.id)) return s;
          const n = new Set(s).add(f.id);
          onDispatched?.();
          return n;
        });
      } else {
        setErrors((e) => ({ ...e, [f.id]: `HTTP ${r.status}: ${r.body.slice(0, 80)}` }));
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [f.id]: (err as Error).message }));
    } finally {
      setSending((s) => { const n = new Set(s); n.delete(f.id); return n; });
    }
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">DISPATCH FEED · {live ? "NASA FIRMS LIVE" : "STAND-BY"}</h2>
        </div>
        <div className="text-mono text-[10px] text-muted-foreground">
          <span className="text-[oklch(0.78_0.22_25)] ticker">●</span> {unhandled} UNHANDLED
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sorted.length === 0 && (
          <div className="flex h-full items-center justify-center text-mono text-[11px] text-muted-foreground">
            {live ? "No active fire signatures in last 24h" : "Awaiting NASA FIRMS uplink…"}
          </div>
        )}
        {sorted.map((f) => {
          const t = confTone(f.confidence);
          const isDispatched = dispatched.has(f.id);
          const isAcked = acked.has(f.id);
          const evasion = evasionTag(f.acqTime);
          const status = isDispatched ? "dispatched" : isAcked ? "ack" : "new";
          return (
            <article key={f.id} className="rounded-md border border-border bg-[oklch(0.215_0.022_252)] p-3 transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-mono text-[10px] font-bold tracking-wider rounded border px-1.5 py-0.5 ${t.cls}`}>
                      {f.confidence}% · {t.label}
                    </span>
                    {evasion && (
                      <span className="inline-flex items-center gap-1 text-mono text-[9px] uppercase tracking-wider text-[oklch(0.88_0.17_80)]">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {evasion === "evening" ? "17:00 EVASION" : "MIDNIGHT EVASION"}
                      </span>
                    )}
                    {f.frp > 50 && (
                      <span className="text-mono text-[9px] font-bold uppercase tracking-wider rounded border border-[oklch(0.65_0.24_25/0.6)] bg-[oklch(0.65_0.24_25/0.18)] px-1.5 py-0.5 text-[oklch(0.78_0.22_25)]">
                        High Priority
                      </span>
                    )}
                    <span className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.satellite}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-bold text-foreground leading-tight">
                    {f.block} <span className="text-muted-foreground font-normal">· FRP {f.frp.toFixed(1)}MW</span>
                  </h3>
                  <div className="mt-0.5 flex items-center gap-2 text-mono text-[11px] text-muted-foreground flex-wrap">
                    <Clock className="h-3 w-3" /> {f.acqDate} {f.acqTime} {f.daynight === "N" ? "· NIGHT" : ""}
                    <span className="opacity-40">|</span>
                    <span>{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</span>
                    <span className="opacity-40">|</span>
                    <span className={`text-mono text-[9px] uppercase tracking-wider ${status === "new" ? "text-[oklch(0.78_0.22_25)]" : status === "ack" ? "text-[oklch(0.88_0.17_80)]" : "text-[oklch(0.85_0.18_155)]"}`}>● {status.toUpperCase()}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-mono text-[10px] text-[oklch(0.85_0.18_155)]">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      Location: {places?.get(f.id)?.ok ? places.get(f.id)!.label : "resolving land use…"}
                    </span>
                  </div>

                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopy(f)}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent hover:border-primary/40"
                >
                  {copied === f.id ? <><Check className="h-3.5 w-3.5 text-primary" /> Route copied</> : <><Copy className="h-3.5 w-3.5" /> Copy GMaps Route</>}
                </button>
                <button
                  onClick={() => handleDispatch(f)}
                  disabled={isDispatched || sending.has(f.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold transition-opacity ${
                    isDispatched
                      ? "bg-[oklch(0.78_0.18_155/0.15)] text-[oklch(0.85_0.18_155)] border border-[oklch(0.78_0.18_155/0.4)] cursor-default"
                      : "bg-[oklch(0.65_0.24_25)] text-white hover:opacity-90 glow-crimson disabled:opacity-60"
                  }`}
                >
                  {isDispatched ? (
                    <><Check className="h-3.5 w-3.5" /> Dispatched</>
                  ) : sending.has(f.id) ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" /> Force Telegram Dispatch</>
                  )}
                </button>
              </div>
              {errors[f.id] && (
                <div className="mt-2 text-mono text-[10px] text-[oklch(0.78_0.22_25)] break-all">
                  ⚠ {errors[f.id]}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">Outcome</span>
                <div className="ml-auto flex gap-1">
                  {STATUS_OPTIONS.map((o) => {
                    const cur = statuses?.[f.id] ?? "pending";
                    const on = cur === o.key;
                    return (
                      <button
                        key={o.key}
                        onClick={() => onStatusChange?.(f.id, o.key)}
                        className={`text-mono rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${on ? o.cls : "border-border bg-transparent text-muted-foreground hover:text-foreground"}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => setVerifyFire(f)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[oklch(0.78_0.10_220/0.4)] bg-[oklch(0.78_0.10_220/0.1)] px-2 py-1.5 text-[11px] font-semibold text-[oklch(0.85_0.10_220)] transition-colors hover:bg-[oklch(0.78_0.10_220/0.2)]"
              >
                <Satellite className="h-3.5 w-3.5" /> Verify Burn Scar
              </button>
            </article>
          );
        })}
      </div>
      <BurnScarModal fire={verifyFire} open={!!verifyFire} onOpenChange={(o) => !o && setVerifyFire(null)} />
    </div>
  );
}

