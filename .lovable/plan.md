## Real ESA Cropland Mask — architecture

The existing GEE backend already authenticates and serves the ESA WorldCover v200 tile layer (cropland = class 40). To actually *filter* fires (not just paint a tile), we need to know each fire's land-cover class. ESA WorldCover is a 10 m raster — there is no public REST endpoint that returns "class at lat/lng" without an auth'd query, and there is no compact GeoJSON of Punjab cropland that would be honest to ship. So the real implementation is: **sample WorldCover at each fire point through GEE on the server**, cache the result, and use that classification on the client to suppress non-cropland fires. Turf.js is added for the secondary urban-exclusion polygon check.

### 1. Dependency
- `bun add @turf/turf`

### 2. New server function — `src/lib/cropland.functions.ts`
- `classifyFires({ points: [{id, lat, lng}, ...] })` (createServerFn, POST, Zod-validated, capped at 200 points/call).
- Handler builds one GEE `value:compute` call using `ee.Image('ESA/WorldCover/v200/2021').reduceRegions` over a `FeatureCollection` of fire points (1 px buffer), returns `{ id, landCover }` for each.
- LRU-cache results in module scope keyed by `lat.toFixed(4)|lng.toFixed(4)` for 24 h (WorldCover is static).
- On GEE failure: return `{ classifications: [], ok: false, reason }` — client falls back to passing fires through unfiltered and the suppressed counter shows `—`. No fake numbers.
- Helper `isCropland(code)` exported: WorldCover crop class is `40`; we also treat `30` (grassland) as **non-cropland** so urban+industrial+water+built (50/80/etc.) are correctly suppressed.

### 3. Client hook — `src/hooks/useCroplandMask.ts`
- Input: `LiveFire[]`.
- Calls `classifyFires` via `useServerFn` + `useQuery`, keyed by sorted fire ids.
- Returns `{ croplandIds: Set<string>, suppressedIds: Set<string>, ready: boolean, ok: boolean }`.
- Secondary Turf check: a small hard-coded `ludhianaUrbanPolygon` GeoJSON (rough multipolygon of the Ludhiana municipal core) — any point inside it is forced into `suppressedIds` regardless of WorldCover (catches mixed-pixel edge cases on city boundary). Uses `booleanPointInPolygon` from `@turf/turf`.

### 4. Dashboard wiring — `src/routes/_authenticated/index.tsx`
- Compute `mask = useCroplandMask(fires)` once.
- Derive `visibleFires = mask.ready ? fires.filter(f => mask.croplandIds.has(f.id)) : fires`.
- Pass `visibleFires` (not `fires`) to `MapView`, `DispatchFeed`, `HourlyChart`.
- Pass `suppressedCount = mask.suppressedIds.size` and `maskReady = mask.ready && mask.ok` to `StatusHeader`.

### 5. `MapView.tsx` — ESA Cropland layer status
- Remove the `BACKEND REQ` fallback for the `cropland` entry. The badge now reflects mask state:
  - `mask.ready && mask.ok` → green `MASK LIVE`
  - in-flight → amber `CLASSIFYING…`
  - error → red `MASK OFFLINE`
- Toggling the layer off in the UI keeps the cropland tile hidden **and** disables suppression (so the user can see raw FIRMS for QA). Wire a new prop `onCroplandToggle(active: boolean)` so the parent can switch between `fires` and `visibleFires`.

### 6. `StatusHeader.tsx` — restore False+ Suppressed
- Add `suppressedCount?: number` and `maskReady?: boolean` props.
- Add a 6th counter card "False+ Suppressed" (crimson tone, `ShieldAlert` icon, sub "Outside ESA cropland mask"). Grid becomes `lg:grid-cols-6`.
- Display rule: `maskReady ? String(suppressedCount) : "—"` — never invent a number when classification hasn't completed.

### 7. What stays out of scope
- No new tables, no auth changes, no migrations.
- Existing ESA WorldCover **tile overlay** stays as-is; this plan only adds point-sampling on top of it.
- Cron / dispatch endpoints unchanged.

### Files touched
- new: `src/lib/cropland.functions.ts`, `src/lib/cropland.server.ts`, `src/hooks/useCroplandMask.ts`
- edited: `src/components/dashboard/MapView.tsx`, `src/components/dashboard/StatusHeader.tsx`, `src/routes/_authenticated/index.tsx`, `package.json` (via `bun add`)
