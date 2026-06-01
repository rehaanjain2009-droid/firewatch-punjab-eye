## Goal

Swap the synthetic SVG map for a real live interactive map centered on the Karimnagar / Telangana focus area, with NASA FIRMS pulsing markers and the Earth Engine tile overlays (Sentinel-2 NBR + ESA WorldCover Cropland) drawn as actual map tiles. Update branding, sector labels, and the StatusHeader so the UI matches the new satellite focus instead of saying "Punjab · Ludhiana Sector".

## Map library

Use **Leaflet + react-leaflet** with OpenStreetMap basemap. Reasons:
- GEE `getMapId` returns standard XYZ tile URLs — drops straight into Leaflet's `TileLayer`.
- No API key, no referrer restriction, no `mapId` config — works on every Lovable preview.
- Lightweight; fits the dark tactical aesthetic with a dark tile theme (CartoDB Dark Matter).
- Free pan/zoom, real geographic projection — current SVG hard-codes a bbox and can't pan.

Google Maps JS is the alternative but adds a connector dependency and a heavier API for raster overlays. Leaflet is the right tool here.

## Changes

### 1. Add dependencies
- `leaflet`, `react-leaflet`, `@types/leaflet`

### 2. Rewrite `src/components/dashboard/MapView.tsx`
- Replace the SVG canvas with `<MapContainer center={[18.15351, 79.5154]} zoom={9}>`.
- Basemap: CartoDB Dark Matter XYZ tiles (matches the dashboard theme).
- Add `<TileLayer>` for each GEE layer (`nbr`, `cropland`) using their live `tileUrl`, controlled by the existing layer toggle. Cropland gets ~0.5 opacity, NBR ~0.7.
- Render FIRMS fire points as `<CircleMarker>` with the same severity color ramp and a CSS pulse ring. Click → opens the existing hotspot popup panel.
- Keep the existing UI chrome (layer toggle, GEE-tiles-live pill, hotspot detail card, FIRMS status pill, GEE auth-fail banner) overlaid on top of the map via absolute positioning.
- Drop the fake rivers/roads SVG and the hardcoded city labels (the real basemap shows them).
- Update the header title to "TACTICAL GIS · KARIMNAGAR SECTOR" and the coordinate readout to `18.15°N · 79.51°E`.

### 3. Update `src/components/dashboard/StatusHeader.tsx`
- Subtitle: "Telangana State Disaster Response · Stubble & Wildfire Intelligence Grid · Karimnagar Sector".
- Station code: `KNR-CMD-01`.
- Keep operator/clock layout unchanged.

### 4. CSS
- Import `leaflet/dist/leaflet.css` once (in MapView or `src/styles.css`).
- Add a small `.leaflet-container { background: oklch(0.20 0.025 252); }` rule so the map blends with the panel while tiles load.
- Keep the existing `pulse-ring` keyframes for fire markers.

## Out of scope

- No backend changes — FIRMS bbox, FIRMS day range, GEE tile URLs, dispatch logic, cron, and Telegram all stay as-is.
- No new dependencies beyond Leaflet.
- The `BLOCKS` city list (already updated to Telangana) stays as the nearest-city lookup for the Dispatch Feed labels.

## Verification

After build:
1. Map renders centered on Karimnagar with dark basemap and visible road/town labels.
2. FIRMS markers pulse at real geographic coordinates around 18.15, 79.51.
3. Toggling "Sentinel-2 NBR" and "ESA Cropland" in the layer panel shows/hides the GEE raster overlays on the map.
4. Clicking a fire point opens the hotspot detail card with lat/lng, confidence, FRP, and the "Lock target & dispatch" Google Maps link.
5. Header reads "Karimnagar Sector" — no more Punjab/Ludhiana references in the UI.
