## Goal
Replace the dashboard's mock hotspot/satellite data with real Google Earth Engine (GEE) computations: NASA FIRMS active fires, Sentinel-2 NBR burn scars, and ESA WorldCover cropland masking — restricted to Punjab.

## How Earth Engine works (short version)
GEE is a server-side geospatial compute platform. You don't download raw imagery — you describe a computation (filter collection → mask → reduce → export) using their JS/Python API, and Google's servers run it on petabytes of satellite data and return either:
- **Tile URLs** (XYZ map tiles) to render on a Leaflet/Mapbox map, or
- **JSON feature lists** (e.g. lat/lng + confidence for each fire pixel) via `getInfo()` / `evaluate()`.

Auth is **OAuth 2.0 via a Google Cloud service account** — not a simple API key. That service account JSON must stay server-side (never in the browser).

## What I need from you
To wire this up, please provide / do the following on the Google side. None of it requires code changes from you — just one-time setup in Google Cloud + Earth Engine consoles:

1. **Create / pick a Google Cloud project** (e.g. `punjab-firmap`).
2. **Register the project for Earth Engine** at https://code.earthengine.google.com/register — choose "Use without a Cloud project" → No, then select your Cloud project. Pick *Commercial* or *Noncommercial/Academic* (free for govt/research use; PPF likely qualifies as noncommercial).
3. **Enable the Earth Engine API** for that project: https://console.cloud.google.com/apis/library/earthengine.googleapis.com
4. **Create a service account** in IAM → Service Accounts:
   - Name: e.g. `gee-ppf-bot`
   - Role: `Earth Engine Resource Viewer` (and `Service Usage Consumer`)
5. **Register the service account** with EE: https://signup.earthengine.google.com/#!/service_accounts
6. **Create a JSON key** for that service account and download it.
7. **Paste the JSON contents** to me — I will store it as a Lovable Cloud secret named `GEE_SERVICE_ACCOUNT_JSON` (never committed to code, never exposed to browser).
8. Confirm the **Cloud project ID** so I can use it in API calls.

Optional but recommended:
- Tell me your preferred **AOI bbox** (currently I'm using Punjab ~ `[73.9, 29.5, 76.9, 32.5]`).
- Confirm the **NASA FIRMS product** (VIIRS_SNPP_NRT vs MODIS) and confidence threshold (default 70%).

## Plan once credentials are in place

### Architecture
```
Browser ──► TanStack server fn ──► Earth Engine REST API
                  │                       │
                  ▼                       ▼
          GEE_SERVICE_ACCOUNT_JSON   tile URLs / JSON
                  │
                  ▼
          5-min in-memory cache
```

We use the **Earth Engine REST API** (`https://earthengine.googleapis.com/v1/`) directly with an OAuth2 access token minted from the service account JWT. This avoids the `@google/earthengine` npm package, which is Node-only and won't run in the Cloudflare Worker SSR runtime.

### Server functions (`src/lib/gee.functions.ts` + `gee.server.ts`)
1. `getAccessToken()` — sign JWT with service account private key (using Web Crypto, Worker-compatible), exchange for OAuth token, cache 50min.
2. `getActiveFires({ bbox, hours })` — runs an EE expression:
   - `ee.FeatureCollection('FIRMS')` filtered by date + bbox
   - intersected with `ee.Image('ESA/WorldCover/v200').eq(40)` cropland mask
   - `.getInfo()` → list of `{lat, lng, confidence, acq_time}` fed to `MapView` markers + `DispatchFeed`.
3. `getFirmsTileUrl()` / `getNbrTileUrl()` / `getCroplandTileUrl()` — call `getMapId` to get XYZ tile templates for the three map layers.
4. `getHourlyHistogram({ bbox, days })` — reduce FIRMS by hour-of-day for the analytics chart.

### Client wiring
- Replace map background `<div>` with **react-leaflet** + an OpenStreetMap base, then overlay the three GEE tile layers (toggleable as today).
- Replace `HOTSPOTS` constant with a `useQuery` hook hitting `getActiveFires`. Auto-refresh every 5 min.
- Replace `HourlyChart` mock data with `getHourlyHistogram`.
- Wire `SystemConsole` to log real cron ticks and EE response codes from the server.

### Caching & limits
- 5-minute server-side cache per (bbox, layer) — EE quotas are generous but not infinite.
- Tile URLs from `getMapId` are valid for ~24h; refresh on demand.

### Dependencies to add
- `react-leaflet`, `leaflet` (frontend map)
- `@tanstack/react-query` (already present likely; for polling)
- `jose` (JWT signing — Worker-safe, pure JS)

### Fix during this work
Hydration mismatch in `SystemConsole` from `nowTs()` running at SSR vs client time — gate timestamp rendering behind a `useEffect`/mounted flag.

## Out of scope for this plan
- Per-user OAuth (we use a single service-account identity, which is what GEE expects for backend apps).
- Exporting large rasters to Drive/GCS (not needed for the dashboard).
- Telegram bot wiring (separate request).
