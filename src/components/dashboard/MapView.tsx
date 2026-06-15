import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
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

type Diag = null | { ok: boolean; step: string; message: string; httpStatus?: number };
type Tile = { id: "nbr" | "cropland"; label: string; tileUrl: string };

const FOCUS: [number, number] = [30.901, 75.857];
const DEFAULT_ZOOM = 10;

const LAYERS = [
  { id: "base", label: "Base Map", icon: MapIcon },
  { id: "firms", label: "FIRMS Thermal", icon: Flame },
  { id: "nbr", label: "Sentinel-2 NBR", icon: Satellite },
  { id: "cropland", label: "ESA Cropland", icon: Sprout },
] as const;

type LayerId = typeof LAYERS[number]["id"];

const sevColor = (c: number) => c >= 80 ? "oklch(0.65 0.24 25)" : c >= 60 ? "oklch(0.82 0.17 80)" : "oklch(0.78 0.18 155)";
const sevHex = (c: number) => c >= 80 ? "#e8473a" : c >= 60 ? "#f0b400" : "#22c08a";
const sevLevel = (c: number): "high" | "med" | "low" => c >= 80 ? "high" : c >= 60 ? "med" : "low";

type Props = {
  fires: LiveFire[];
  live: boolean;
  source: string;
  tiles: Tile[];
  diag: Diag;
};

function Recenter({ target }: { target: LiveFire | null }) {
  const map = useMap();
  if (target) map.flyTo([target.lat, target.lng], 11, { duration: 0.8 });
  return null;
}

export function MapView({ fires, live, source, tiles, diag }: Props) {
  const [active, setActive] = useState<Set<LayerId>>(new Set(["base", "firms", "cropland", "nbr"]));
  const [selected, setSelected] = useState<LiveFire | null>(null);
  const [flyTarget, setFlyTarget] = useState<LiveFire | null>(null);

  const toggle = (id: LayerId) => {
    const next = new Set(active);
    next.has(id) ? next.delete(id) : next.add(id);
    setActive(next);
  };

  const nbrTile = tiles.find((t) => t.id === "nbr");
  const cropTile = tiles.find((t) => t.id === "cropland");
  const sel = selected ?? fires[0] ?? null;

  const handlePick = (f: LiveFire) => {
    setSelected(f);
    setFlyTarget(f);
  };

  return (
    <div className="panel relative flex h-full flex-col overflow-hidden">
      <div className="panel-header flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wide">TACTICAL GIS · LUDHIANA SECTOR</h2>
          <span className="text-mono text-[10px] text-muted-foreground">30.90°N · 75.86°E</span>
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
              
            </div>
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <MapContainer
          center={FOCUS}
          zoom={DEFAULT_ZOOM}
          className="absolute inset-0 h-full w-full"
          zoomControl
          attributionControl
          worldCopyJump
        >
          {active.has("base") && (
            <TileLayer
              attribution='&copy; OpenStreetMap &copy; CARTO'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains={["a", "b", "c", "d"]}
              maxZoom={19}
            />
          )}
          {active.has("cropland") && cropTile && (
            <TileLayer url={cropTile.tileUrl} opacity={0.45} maxZoom={19} />
          )}
          {active.has("nbr") && nbrTile && (
            <TileLayer url={nbrTile.tileUrl} opacity={0.75} maxZoom={19} />
          )}

          {active.has("firms") && fires.map((f) => {
            const c = sevHex(f.confidence);
            const isSel = sel?.id === f.id;
            return (
              <CircleMarker
                key={f.id}
                center={[f.lat, f.lng]}
                radius={isSel ? 9 : 6}
                pathOptions={{
                  color: c,
                  fillColor: c,
                  fillOpacity: 0.85,
                  weight: isSel ? 3 : 2,
                  opacity: 1,
                }}
                eventHandlers={{ click: () => handlePick(f) }}
              />
            );
          })}

          <Recenter target={flyTarget} />
        </MapContainer>

        {/* Layer toggle */}
        <div className="absolute left-3 top-3 panel p-2 z-[1000]">
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

        {/* Live GEE tile URLs proof */}
        {tiles.length > 0 && (
          <div className="absolute left-3 bottom-3 panel max-w-[55%] p-2 text-mono text-[9px] text-muted-foreground space-y-1 z-[1000]">
            <div className="text-[oklch(0.85_0.18_155)] font-bold uppercase tracking-wider">● GEE TILE FEEDS LIVE</div>
            {tiles.map((t) => (
              <div key={t.id} className="truncate"><span className="text-foreground/80">{t.label}:</span> <span className="text-[oklch(0.78_0.10_220)]">{t.tileUrl.replace(/^https:\/\/[^/]+/, "")}</span></div>
            ))}
          </div>
        )}

        {/* Compass */}
        <div className="absolute right-3 bottom-3 panel px-2 py-1.5 text-mono text-[10px] text-muted-foreground z-[1000]">
          <div className="flex items-center gap-1.5"><Crosshair className="h-3 w-3 text-primary" /> N · 30.90, 75.86 · LUDHIANA</div>
        </div>

        {!live && fires.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-[1000]">
            <div className="panel px-4 py-2 text-mono text-[11px] text-muted-foreground flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 animate-pulse text-primary" /> Awaiting NASA FIRMS uplink…
            </div>
          </div>
        )}

        {/* Hotspot popup */}
        {sel && (
          <div className="absolute right-3 top-3 panel w-72 p-3 z-[1000]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: sevColor(sel.confidence), boxShadow: `0 0 8px ${sevColor(sel.confidence)}` }} />
                  <span className="text-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{sel.id}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">{sel.block} <span className="text-muted-foreground font-normal">· {sel.satellite}</span></div>
              </div>
              <button onClick={() => { setSelected(null); setFlyTarget(null); }} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
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
              href={`https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lng}`}
              target="_blank" rel="noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MapPin className="h-3.5 w-3.5" /> Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
