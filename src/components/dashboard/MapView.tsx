import { useEffect, useState } from "react";
import { Layers, Map as MapIcon, Flame, Satellite, Sprout, Crosshair, MapPin, X, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveFires, getGeeStatus } from "@/lib/gee.functions";

type Hotspot = {
  id: string;
  name: string;
  block: string;
  lat: number;
  lng: number;
  confidence: number;
  detected: string;
  severity: "high" | "med" | "low";
  // map position % (left, top)
  x: number;
  y: number;
};

const HOTSPOTS: Hotspot[] = [
  { id: "FRM-2841", name: "Khet 14-B", block: "Jagraon", lat: 30.7892, lng: 75.4731, confidence: 94, detected: "17:04 IST", severity: "high", x: 22, y: 58 },
  { id: "FRM-2842", name: "Sector 7", block: "Khanna", lat: 30.7038, lng: 76.2215, confidence: 88, detected: "17:11 IST", severity: "high", x: 71, y: 36 },
  { id: "FRM-2843", name: "Plot 9-A", block: "Raikot", lat: 30.6491, lng: 75.6055, confidence: 71, detected: "00:18 IST", severity: "med", x: 35, y: 70 },
  { id: "FRM-2844", name: "Block 22", blockName: "Mullanpur", block: "Mullanpur Dakha", lat: 30.8642, lng: 75.6711, confidence: 82, detected: "16:52 IST", severity: "high", x: 30, y: 28 } as any,
  { id: "FRM-2845", name: "Field K-3", block: "Samrala", lat: 30.8348, lng: 76.1929, confidence: 67, detected: "23:47 IST", severity: "med", x: 64, y: 22 },
  { id: "FRM-2846", name: "Sector 3", block: "Payal", lat: 30.6996, lng: 76.0518, confidence: 58, detected: "17:22 IST", severity: "low", x: 56, y: 52 },
  { id: "FRM-2847", name: "Khet 8", block: "Sidhwan Bet", lat: 30.9118, lng: 75.5740, confidence: 91, detected: "17:08 IST", severity: "high", x: 18, y: 38 },
];

const LAYERS = [
  { id: "base", label: "Base Map", icon: MapIcon },
  { id: "firms", label: "FIRMS Thermal", icon: Flame },
  { id: "nbr", label: "Sentinel-2 NBR", icon: Satellite },
  { id: "crop", label: "ESA Cropland", icon: Sprout },
] as const;

type LayerId = typeof LAYERS[number]["id"];

const sevColor = (s: Hotspot["severity"]) =>
  s === "high" ? "oklch(0.65 0.24 25)" : s === "med" ? "oklch(0.82 0.17 80)" : "oklch(0.78 0.18 155)";

const PUNJAB_BBOX = { w: 73.9, s: 29.5, e: 76.9, n: 32.5 };

export function MapView() {
  const [active, setActive] = useState<Set<LayerId>>(new Set(["base", "firms", "crop"]));
  const [selected, setSelected] = useState<Hotspot | null>(HOTSPOTS[0]);
  const [live, setLive] = useState<{ on: boolean; count: number }>({ on: false, count: 0 });
  const [diag, setDiag] = useState<null | { step: string; ok: boolean; message: string; httpStatus?: number; httpBody?: string; projectId?: string | null; clientEmail?: string }>(null);
  const fetchFires = useServerFn(getActiveFires);
  const fetchStatus = useServerFn(getGeeStatus);

  useEffect(() => {
    let mounted = true;
    fetchStatus().then((s) => { if (mounted) setDiag(s as any); }).catch(() => {});
    fetchFires()
      .then((r) => {
        if (!mounted) return;
        if (r.live) setLive({ on: true, count: r.fires.length });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [fetchFires, fetchStatus]);

  const toggle = (id: LayerId) => {
    const next = new Set(active);
    next.has(id) ? next.delete(id) : next.add(id);
    setActive(next);
  };

  return (
    <div className="panel relative flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">TACTICAL GIS · LUDHIANA SECTOR</h2>
          <span className="text-mono text-[10px] text-muted-foreground">30.9010°N · 75.8573°E</span>
        </div>
        <div className="flex items-center gap-3 text-mono text-[10px] text-muted-foreground">
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border ${live.on ? "border-[oklch(0.85_0.18_155)/40] text-[oklch(0.85_0.18_155)]" : "border-muted-foreground/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live.on ? "bg-[oklch(0.85_0.18_155)] shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40"}`} />
            {live.on ? `LIVE GEE · ${live.count} px` : "GEE · OFFLINE"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary ticker" />
            {HOTSPOTS.length} HOTSPOTS · LAST SYNC 00:42s
          </span>
        </div>
      </div>

      {diag && !diag.ok && (
        <div className="border-b border-[oklch(0.65_0.24_25)/40] bg-[oklch(0.65_0.24_25)/10] px-4 py-2 text-mono text-[11px] text-[oklch(0.85_0.18_25)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1 space-y-0.5">
              <div className="font-bold uppercase tracking-wider">GEE AUTH FAIL · step={diag.step}{diag.httpStatus ? ` · HTTP ${diag.httpStatus}` : ""}</div>
              <div className="text-foreground/90">{diag.message}</div>
              {diag.clientEmail && <div className="text-muted-foreground">SA: {diag.clientEmail} → project: {diag.projectId ?? "—"}</div>}
              {diag.httpBody && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 text-[10px] text-foreground/80">{diag.httpBody}</pre>}
            </div>
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {/* Base map: synthetic tactical terrain */}
        <div className="absolute inset-0 bg-[oklch(0.20_0.025_252)]">
          <div className="absolute inset-0 grid-bg opacity-60" />
          {/* river */}
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M -2 30 Q 20 35 35 28 T 70 40 T 105 38" stroke="oklch(0.55 0.10 220 / 0.55)" strokeWidth="0.8" fill="none" />
            <path d="M -2 75 Q 25 70 50 78 T 105 72" stroke="oklch(0.55 0.10 220 / 0.4)" strokeWidth="0.5" fill="none" />
            {/* roads */}
            <path d="M 0 50 L 100 48" stroke="oklch(0.45 0.02 252 / 0.7)" strokeWidth="0.4" />
            <path d="M 50 0 L 52 100" stroke="oklch(0.45 0.02 252 / 0.7)" strokeWidth="0.4" />
            <path d="M 10 10 L 90 90" stroke="oklch(0.4 0.02 252 / 0.5)" strokeWidth="0.3" strokeDasharray="1 1" />
          </svg>

          {/* ESA Cropland overlay */}
          {active.has("crop") && (
            <div className="absolute inset-0 mix-blend-screen opacity-50">
              <div className="absolute left-[8%] top-[20%] h-[55%] w-[40%] rounded-[40%] bg-[oklch(0.55_0.18_140/0.25)] blur-2xl" />
              <div className="absolute right-[8%] top-[12%] h-[60%] w-[42%] rounded-[35%] bg-[oklch(0.55_0.18_140/0.22)] blur-2xl" />
              <div className="absolute left-[30%] bottom-[8%] h-[35%] w-[40%] rounded-[40%] bg-[oklch(0.55_0.18_140/0.18)] blur-2xl" />
            </div>
          )}

          {/* Sentinel-2 NBR burn scars */}
          {active.has("nbr") && (
            <div className="absolute inset-0 pointer-events-none">
              {HOTSPOTS.map((h) => (
                <div
                  key={`nbr-${h.id}`}
                  className="absolute h-12 w-16 rounded-full"
                  style={{
                    left: `${h.x}%`, top: `${h.y}%`, transform: "translate(-50%,-50%)",
                    background: "radial-gradient(ellipse, oklch(0.35 0.1 30 / 0.55), transparent 70%)",
                  }}
                />
              ))}
            </div>
          )}

          {/* FIRMS thermal overlay */}
          {active.has("firms") && (
            <div className="absolute inset-0 pointer-events-none">
              {HOTSPOTS.map((h) => (
                <div
                  key={`firms-${h.id}`}
                  className="absolute h-24 w-24 rounded-full"
                  style={{
                    left: `${h.x}%`, top: `${h.y}%`, transform: "translate(-50%,-50%)",
                    background: `radial-gradient(circle, ${sevColor(h.severity)} 0%, transparent 65%)`,
                    opacity: 0.45,
                    filter: "blur(2px)",
                  }}
                />
              ))}
            </div>
          )}

          {/* City label */}
          <div className="absolute left-[48%] top-[46%] -translate-x-1/2 text-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70">
            ◉ Ludhiana
          </div>
          <div className="absolute left-[22%] top-[60%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Jagraon</div>
          <div className="absolute left-[71%] top-[38%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Khanna</div>
          <div className="absolute left-[35%] top-[72%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Raikot</div>
          <div className="absolute left-[64%] top-[24%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Samrala</div>

          {/* Hotspot markers */}
          {HOTSPOTS.map((h) => {
            const c = sevColor(h.severity);
            const isSel = selected?.id === h.id;
            return (
              <button
                key={h.id}
                onClick={() => setSelected(h)}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
                aria-label={`Hotspot ${h.id}`}
              >
                <span className="absolute inset-0 m-auto h-3 w-3 rounded-full pulse-ring" style={{ background: c, opacity: 0.6 }} />
                <span
                  className="relative block h-3 w-3 rounded-full ring-2 ring-background"
                  style={{ background: c, boxShadow: `0 0 10px ${c}` }}
                />
                {isSel && (
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border" style={{ borderColor: c }} />
                )}
              </button>
            );
          })}

          {/* Compass */}
          <div className="absolute right-3 bottom-3 panel px-2 py-1.5 text-mono text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Crosshair className="h-3 w-3 text-primary" /> N · 30.90, 75.85 · ZOOM 11
            </div>
          </div>
        </div>

        {/* Layer toggle panel */}
        <div className="absolute left-3 top-3 panel p-2">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Layers className="h-3 w-3" /> Layers
          </div>
          <div className="flex flex-col gap-1">
            {LAYERS.map((l) => {
              const on = active.has(l.id);
              const Icon = l.icon;
              return (
                <button
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    on ? "bg-primary/15 text-primary border border-primary/40" : "border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium">{l.label}</span>
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${on ? "bg-primary shadow-[0_0_8px_currentColor]" : "bg-muted"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Hotspot popup */}
        {selected && (
          <div className="absolute right-3 top-3 panel w-72 p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: sevColor(selected.severity), boxShadow: `0 0 8px ${sevColor(selected.severity)}` }}
                  />
                  <span className="text-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{selected.id}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">{selected.block} · {selected.name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-mono text-[11px]">
              <div className="rounded bg-accent/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Latitude</div>
                <div className="text-foreground">{selected.lat.toFixed(4)}°N</div>
              </div>
              <div className="rounded bg-accent/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Longitude</div>
                <div className="text-foreground">{selected.lng.toFixed(4)}°E</div>
              </div>
              <div className="rounded bg-accent/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</div>
                <div className="text-foreground">{selected.confidence}%</div>
              </div>
              <div className="rounded bg-accent/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Detected</div>
                <div className="text-foreground">{selected.detected}</div>
              </div>
            </div>
            <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90">
              <MapPin className="h-3.5 w-3.5" /> Lock target & dispatch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
