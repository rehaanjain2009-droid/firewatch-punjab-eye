import { useState } from "react";
import { Layers, Map as MapIcon, Flame, Satellite, Sprout, Crosshair, MapPin, X, AlertTriangle, Radio } from "lucide-react";

export type LiveFire = {
  id: string;
  lat: number;
  lng: number;
  confidence: number;
  brightness: number;
  frp: number;
  acqDate: string;
  acqTime: string;
  daynight: "D" | "N";
  satellite: string;
  block: string;
};

type Diag = null | { ok: boolean; step: string; message: string; httpStatus?: number; httpBody?: string; clientEmail?: string; projectId?: string | null };
type Tile = { id: "nbr" | "cropland"; label: string; tileUrl: string };

const PUNJAB_BBOX = { w: 78.0, s: 16.5, e: 81.0, n: 19.7 };

const LAYERS = [
  { id: "base", label: "Base Map", icon: MapIcon },
  { id: "firms", label: "FIRMS Thermal", icon: Flame },
  { id: "nbr", label: "Sentinel-2 NBR", icon: Satellite },
  { id: "cropland", label: "ESA Cropland", icon: Sprout },
] as const;

type LayerId = typeof LAYERS[number]["id"];

const sevColor = (c: number) => c >= 80 ? "oklch(0.65 0.24 25)" : c >= 60 ? "oklch(0.82 0.17 80)" : "oklch(0.78 0.18 155)";
const sevLevel = (c: number): "high" | "med" | "low" => c >= 80 ? "high" : c >= 60 ? "med" : "low";

function project(lat: number, lng: number) {
  const x = ((lng - PUNJAB_BBOX.w) / (PUNJAB_BBOX.e - PUNJAB_BBOX.w)) * 100;
  const y = ((PUNJAB_BBOX.n - lat) / (PUNJAB_BBOX.n - PUNJAB_BBOX.s)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

type Props = {
  fires: LiveFire[];
  live: boolean;
  source: string;
  tiles: Tile[];
  diag: Diag;
};

export function MapView({ fires, live, source, tiles, diag }: Props) {
  const [active, setActive] = useState<Set<LayerId>>(new Set(["base", "firms", "cropland"]));
  const [selected, setSelected] = useState<LiveFire | null>(null);

  const toggle = (id: LayerId) => {
    const next = new Set(active);
    next.has(id) ? next.delete(id) : next.add(id);
    setActive(next);
  };

  const nbrTile = tiles.find((t) => t.id === "nbr");
  const cropTile = tiles.find((t) => t.id === "cropland");
  const sel = selected ?? fires[0] ?? null;

  return (
    <div className="panel relative flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">TACTICAL GIS · PUNJAB SECTOR</h2>
          <span className="text-mono text-[10px] text-muted-foreground">30.90°N · 75.85°E</span>
        </div>
        <div className="flex items-center gap-3 text-mono text-[10px] text-muted-foreground">
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border ${live ? "border-[oklch(0.85_0.18_155)/40] text-[oklch(0.85_0.18_155)]" : "border-muted-foreground/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[oklch(0.85_0.18_155)] shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40"}`} />
            {live ? `FIRMS · ${source} · ${fires.length} px` : "FIRMS · OFFLINE"}
          </span>
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border ${tiles.length ? "border-[oklch(0.85_0.18_155)/40] text-[oklch(0.85_0.18_155)]" : "border-muted-foreground/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tiles.length ? "bg-[oklch(0.85_0.18_155)] shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40"}`} />
            GEE TILES · {tiles.length}/2
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
              {diag.httpBody && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 text-[10px] text-foreground/80">{diag.httpBody}</pre>}
            </div>
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[oklch(0.20_0.025_252)]">
          <div className="absolute inset-0 grid-bg opacity-60" />

          {/* Synthetic terrain: rivers + roads */}
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M -2 30 Q 20 35 35 28 T 70 40 T 105 38" stroke="oklch(0.55 0.10 220 / 0.55)" strokeWidth="0.8" fill="none" />
            <path d="M -2 75 Q 25 70 50 78 T 105 72" stroke="oklch(0.55 0.10 220 / 0.4)" strokeWidth="0.5" fill="none" />
            <path d="M 0 50 L 100 48" stroke="oklch(0.45 0.02 252 / 0.7)" strokeWidth="0.4" />
            <path d="M 50 0 L 52 100" stroke="oklch(0.45 0.02 252 / 0.7)" strokeWidth="0.4" />
            <path d="M 10 10 L 90 90" stroke="oklch(0.4 0.02 252 / 0.5)" strokeWidth="0.3" strokeDasharray="1 1" />
          </svg>

          {/* ESA Cropland overlay (live tile URL → visualized as glow + URL pill) */}
          {active.has("cropland") && (
            <div className="absolute inset-0 mix-blend-screen opacity-50 pointer-events-none">
              <div className="absolute left-[8%] top-[20%] h-[55%] w-[40%] rounded-[40%] bg-[oklch(0.55_0.18_140/0.25)] blur-2xl" />
              <div className="absolute right-[8%] top-[12%] h-[60%] w-[42%] rounded-[35%] bg-[oklch(0.55_0.18_140/0.22)] blur-2xl" />
              <div className="absolute left-[30%] bottom-[8%] h-[35%] w-[40%] rounded-[40%] bg-[oklch(0.55_0.18_140/0.18)] blur-2xl" />
            </div>
          )}

          {/* Sentinel-2 NBR burn scars under each fire */}
          {active.has("nbr") && (
            <div className="absolute inset-0 pointer-events-none">
              {fires.map((f) => {
                const p = project(f.lat, f.lng);
                return (
                  <div key={`nbr-${f.id}`} className="absolute h-12 w-16 rounded-full"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)",
                      background: "radial-gradient(ellipse, oklch(0.35 0.1 30 / 0.55), transparent 70%)" }} />
                );
              })}
            </div>
          )}

          {/* FIRMS thermal heat halo */}
          {active.has("firms") && (
            <div className="absolute inset-0 pointer-events-none">
              {fires.map((f) => {
                const p = project(f.lat, f.lng);
                return (
                  <div key={`firms-${f.id}`} className="absolute h-24 w-24 rounded-full"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)",
                      background: `radial-gradient(circle, ${sevColor(f.confidence)} 0%, transparent 65%)`,
                      opacity: 0.45, filter: "blur(2px)" }} />
                );
              })}
            </div>
          )}

          {/* City labels */}
          <div className="absolute left-[48%] top-[46%] -translate-x-1/2 text-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70">◉ Ludhiana</div>
          <div className="absolute left-[22%] top-[60%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Jagraon</div>
          <div className="absolute left-[71%] top-[38%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Khanna</div>
          <div className="absolute left-[35%] top-[72%] -translate-x-1/2 text-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Raikot</div>

          {/* Live FIRMS markers */}
          {fires.map((f) => {
            const p = project(f.lat, f.lng);
            const c = sevColor(f.confidence);
            const isSel = sel?.id === f.id;
            return (
              <button key={f.id} onClick={() => setSelected(f)}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-label={`Fire ${f.id}`}>
                <span className="absolute inset-0 m-auto h-3 w-3 rounded-full pulse-ring" style={{ background: c, opacity: 0.6 }} />
                <span className="relative block h-3 w-3 rounded-full ring-2 ring-background" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
                {isSel && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border" style={{ borderColor: c }} />}
              </button>
            );
          })}

          {!live && fires.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="panel px-4 py-2 text-mono text-[11px] text-muted-foreground flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 animate-pulse text-primary" /> Awaiting NASA FIRMS uplink…
              </div>
            </div>
          )}

          {/* Compass */}
          <div className="absolute right-3 bottom-3 panel px-2 py-1.5 text-mono text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><Crosshair className="h-3 w-3 text-primary" /> N · 30.90, 75.85 · ZOOM 9</div>
          </div>

          {/* Live tile URLs (proof of LIVE getMapId) */}
          {tiles.length > 0 && (
            <div className="absolute left-3 bottom-3 panel max-w-[60%] p-2 text-mono text-[9px] text-muted-foreground space-y-1">
              <div className="text-[oklch(0.85_0.18_155)] font-bold uppercase tracking-wider">● GEE TILE FEEDS LIVE</div>
              {tiles.map((t) => (
                <div key={t.id} className="truncate"><span className="text-foreground/80">{t.label}:</span> <span className="text-[oklch(0.78_0.10_220)]">{t.tileUrl}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* Layer toggle */}
        <div className="absolute left-3 top-3 panel p-2">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Layers className="h-3 w-3" /> Layers
          </div>
          <div className="flex flex-col gap-1">
            {LAYERS.map((l) => {
              const on = active.has(l.id);
              const Icon = l.icon;
              const liveTag = l.id === "firms" ? live : l.id === "nbr" ? !!nbrTile : l.id === "cropland" ? !!cropTile : true;
              return (
                <button key={l.id} onClick={() => toggle(l.id)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${on ? "bg-primary/15 text-primary border border-primary/40" : "border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium">{l.label}</span>
                  {liveTag && <span className="text-[8px] text-[oklch(0.85_0.18_155)] tracking-wider">LIVE</span>}
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${on ? "bg-primary shadow-[0_0_8px_currentColor]" : "bg-muted"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Hotspot popup */}
        {sel && (
          <div className="absolute right-3 top-3 panel w-72 p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: sevColor(sel.confidence), boxShadow: `0 0 8px ${sevColor(sel.confidence)}` }} />
                  <span className="text-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{sel.id}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">{sel.block} <span className="text-muted-foreground font-normal">· {sel.satellite}</span></div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-mono text-[11px]">
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Latitude</div><div className="text-foreground">{sel.lat.toFixed(4)}°N</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Longitude</div><div className="text-foreground">{sel.lng.toFixed(4)}°E</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</div><div className="text-foreground">{sel.confidence}% · {sevLevel(sel.confidence).toUpperCase()}</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Brightness</div><div className="text-foreground">{sel.brightness.toFixed(1)}K</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">FRP</div><div className="text-foreground">{sel.frp.toFixed(1)} MW</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Acquired</div><div className="text-foreground">{sel.acqDate} {sel.acqTime}</div></div>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}&travelmode=driving`}
              target="_blank" rel="noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MapPin className="h-3.5 w-3.5" /> Lock target & dispatch
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
