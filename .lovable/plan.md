## Replace fake KPI cards with real FIRMS metrics

### Goal
Remove all hardcoded KPI text from the top row of the dashboard and replace it with metrics computed directly from the live NASA FIRMS `fires` array.

### Changes

#### 1. `src/components/dashboard/StatusHeader.tsx`
- Add a `fires: LiveFire[]` prop.
- Compute three real metrics with `useMemo`:
  - **Total Thermal Anomalies**: `fires.length`
  - **Peak Intensity (Max FRP)**: `Math.max(...fires.map(f => f.frp), 0)` formatted as e.g. `"14.2 MW"`
  - **High Confidence Detections**: `fires.filter(f => f.confidence >= 80).length` (the server already normalizes VIIRS `"h"` to `90` and MODIS numeric values are preserved)
- Remove these fake cards:
  - `Optical · Sentinel-2`
  - `Radar · Sentinel-1`
  - `Automation · CRON`
  - `False+ Suppressed`
  - `Active Alerts Today` (also hardcoded to `27`)
- Keep:
  - `Thermal · FIRMS` as a live-source status tile
  - `Alerts Dispatched` counter we fixed earlier
- Add three new real metric cards alongside the kept cards.
- Restructure the top grid to a single responsive row (e.g. 5 columns on large screens) so the remaining cards fit cleanly.
- Empty-state rule: when `fires.length === 0`, show `0`, `— MW`, and `0` instead of invented values.

#### 2. `src/routes/_authenticated/index.tsx`
- Pass the live `fires` array into `<StatusHeader fires={fires} ... />`.

### Files touched
- `src/components/dashboard/StatusHeader.tsx`
- `src/routes/_authenticated/index.tsx`

### Not in scope
No backend, database, routing, or auth changes.