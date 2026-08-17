# Demo Mode for the Ludhiana dashboard

Add a stakeholder-facing DEMO MODE switch that injects three historical Ludhiana
detections so the map, dispatch feed, metrics, and urban-mask filtering all show
activity even when today's live NASA feed is empty.

## What gets built

1. **Header toggle** — a clearly visible DEMO MODE switch in the top status
   header, right next to the OPERATIONAL badge. When ON it shows an amber
   "SIMULATED DATA" state so nobody mistakes it for live intelligence.

2. **Mock detections** — three fixed Ludhiana fires (the factory fire at
   30.908/75.811, plus 30.850/75.950 and 30.880/75.830), dated 2023-11-05 with
   the given FRP, confidence, times, and satellites.

3. **Seamless swap** — turning Demo Mode ON bypasses the live fetch and renders
   the three fires on the Leaflet map and Dispatch Feed identically to live data
   (routing, Telegram dispatch, burn-scar verification, hourly chart, KPI
   counters). Turning it OFF clears simulated state and restores the live
   (currently empty) feed.

4. **Filter demonstration** — the OpenStreetMap urban-mask + Turf.js
   point-in-polygon filter runs on the simulated fires, so sim-1 inside the
   urban/industrial footprint gets suppressed and counted under "Urban Fires
   Detected", proving the filter live on stage.

## Technical notes

- New `src/lib/demo-fires.ts`: exports a `DEMO_FIRES` array already mapped to the
  existing `LiveFire` shape (`lat`, `lng`, numeric `confidence` via the same
  h/n/l mapping used server-side, `brightness`, `daynight` derived from
  `acq_time`, `satellite`). `block` is filled by the existing `nearestBlock()`
  helper in the dashboard route so nothing downstream changes.
- `src/routes/_authenticated/index.tsx`: add `demoMode` state (default OFF).
  Derive the working fire array as `demoMode ? DEMO_FIRES : liveFires` and feed
  that single array into `useCroplandMask`, `useIndustrialMask`, `visibleFires`,
  `StatusHeader`, `MapView`, `DispatchFeed`, and `HourlyChart` — so masking and
  metrics are automatically exercised on the simulated set. The live fetch effect
  stays untouched; its results are simply not used while demo mode is on.
- `src/components/dashboard/StatusHeader.tsx`: accept `demoMode` and
  `onDemoModeChange` props and render the toggle (shadcn `Switch` with a small
  uppercase label, styled with existing tactical tokens) beside the OPERATIONAL
  pill; swap that pill to an amber "SIMULATED" variant while demo mode is active.
- No backend, database, or server-function changes; nothing is written to the
  live NASA path or Telegram cron.
