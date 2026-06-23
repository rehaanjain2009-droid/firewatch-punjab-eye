import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { Layers, Flame, Satellite, Sprout, Crosshair, MapPin, X, AlertTriangle, Radio, Radar } from "lucide-react";

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

const sevColor = (c: number) => c >= 80 ? "oklch(0.65 0.24 25)" : c >= 60 ? "oklch(0.82 0.17 80)" : "oklch(0.78 0.18 155)";
const sevHex = (c: number) => c >= 80 ? "#e8473a" : c >= 60 ? "#f0b400" : "#22c08a";
const sevLevel = (c: number): "high" | "med" | "low" => c >= 80 ? "high" : c >= 60 ? "med" : "low";

type MaskStatus = "live" | "loading" | "offline";

type Props = {
  fires: LiveFire[];
  live: boolean;
  source: string;
  tiles: Tile[];
  diag: Diag;
  maskStatus?: MaskStatus;
  onCroplandToggle?: (active: boolean) => void;
};

function Recenter({ target }: { target: LiveFire | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 12, { duration: 0.8 });
  }, [target, map]);
  return null;
}

function FitToFires({ fires }: { fires: LiveFire[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = fires
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng))
      .map((f) => [f.lat, f.lng] as [number, number]);
    if (pts.length === 0) {
      map.setView(FOCUS, DEFAULT_ZOOM, { animate: true });
      return;
    }
    if (pts.length === 1) {
      map.setView(pts[0], 12, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true });
  }, [fires, map]);
  return null;
}

type OverlayId = "firms" | "nbr" | "cropland" | "radar";
type OverlayDef = {
  id: OverlayId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
  badge?: "LIVE" | "BACKEND REQ" | "COMING SOON";
};

export function MapView({ fires, live, source, tiles, diag }: Props) {
  const nbrTile = tiles.find((t) => t.id === "nbr");
  const cropTile = tiles.find((t) => t.id === "cropland");

  const overlays: OverlayDef[] = [
    { id: "firms", label: "FIRMS Thermal", icon: Flame, available: true, badge: live ? "LIVE" : undefined },
    { id: "nbr", label: "Sentinel-2 NBR", icon: Satellite, available: !!nbrTile, badge: nbrTile ? "LIVE" : "BACKEND REQ" },
    { id: "cropland", label: "ESA Cropland", icon: Sprout, available: !!cropTile, badge: cropTile ? "LIVE" : "BACKEND REQ" },
    { id: "radar", label: "Sentinel-1 Radar", icon: Radar, available: false, badge: "COMING SOON" },
  ];

  const initial = new Set<OverlayId>(["firms"]);
  if (nbrTile) initial.add("nbr");
  if (cropTile) initial.add("cropland");
  const [active, setActive] = useState<Set<OverlayId>>(initial);
  const [selected, setSelected] = useState<LiveFire | null>(null);
  const [flyTarget, setFlyTarget] = useState<LiveFire | null>(null);

  useEffect(() => {
    setActive((prev) => {
      const next = new Set(prev);
      if (nbrTile) next.add("nbr"); else next.delete("nbr");
      if (cropTile) next.add("cropland"); else next.delete("cropland");
      return next;
    });
  }, [nbrTile, cropTile]);

  const toggle = (id: OverlayId, available: boolean) => {
    if (!available) return;
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
          {/* Base map — always rendered, cannot be toggled off */}
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains={["a", "b", "c", "d"]}
            maxZoom={19}
          />
          {active.has("cropland") && cropTile && (
            <TileLayer url={cropTile.tileUrl} opacity={0.45} maxZoom={19} />
          )}
          {active.has("nbr") && nbrTile && (
            <TileLayer url={nbrTile.tileUrl} opacity={0.75} maxZoom={19} />
          )}

          {active.has("firms") && fires.map((f) => {
            const c = sevHex(f.confidence);
            const isSel = selected?.id === f.id;
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

          <FitToFires fires={fires} />
          <Recenter target={flyTarget} />
        </MapContainer>

        {/* Layer toggle */}
        <div className="absolute left-3 top-3 panel p-2 z-[1000]">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Layers className="h-3 w-3" /> Layers
          </div>
          <div className="mb-1 flex items-center gap-2 rounded-md border border-border bg-accent/30 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Base Map</span>
            <span className="ml-auto text-[8px] tracking-wider text-[oklch(0.85_0.18_155)]">LOCKED</span>
          </div>
          <div className="flex flex-col gap-1">
            {overlays.map((l) => {
              const on = active.has(l.id);
              const Icon = l.icon;
              const badgeColor = l.badge === "LIVE" ? "text-[oklch(0.85_0.18_155)]" : l.badge === "BACKEND REQ" ? "text-[oklch(0.88_0.17_80)]" : "text-muted-foreground";
              return (
                <button
                  key={l.id}
                  onClick={() => toggle(l.id, l.available)}
                  disabled={!l.available}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    !l.available
                      ? "border border-dashed border-border text-muted-foreground/60 cursor-not-allowed opacity-70"
                      : on
                        ? "bg-primary/15 text-primary border border-primary/40"
                        : "border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium">{l.label}</span>
                  {l.badge && <span className={`text-[8px] tracking-wider ${badgeColor}`}>{l.badge}</span>}
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${on && l.available ? "bg-primary shadow-[0_0_8px_currentColor]" : "bg-muted"}`} />
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
        {selected && (
          <div className="absolute right-3 top-3 panel w-72 p-3 z-[1000]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: sevColor(selected.confidence), boxShadow: `0 0 8px ${sevColor(selected.confidence)}` }} />
                  <span className="text-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{selected.id}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">{selected.block} <span className="text-muted-foreground font-normal">· {selected.satellite}</span></div>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setFlyTarget(null); }}
                aria-label="Close popup"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-mono text-[11px]">
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Latitude</div><div className="text-foreground">{selected.lat.toFixed(4)}°N</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Longitude</div><div className="text-foreground">{selected.lng.toFixed(4)}°E</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</div><div className="text-foreground">{selected.confidence}% · {sevLevel(selected.confidence).toUpperCase()}</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Brightness</div><div className="text-foreground">{selected.brightness.toFixed(1)}K</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">FRP</div><div className="text-foreground">{selected.frp.toFixed(1)} MW</div></div>
              <div className="rounded bg-accent/40 px-2 py-1.5"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Acquired</div><div className="text-foreground">{selected.acqDate} {selected.acqTime}</div></div>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${selected.lat.toFixed(6)},${selected.lng.toFixed(6)}`}
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
