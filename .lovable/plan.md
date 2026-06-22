## Three mock-free fixes

### 1. Per-fire GMaps URL (`DispatchFeed.tsx`)
Switch URL format to the one specified: `https://www.google.com/maps?q=${f.lat},${f.lng}` (still guarded by `Number.isFinite`, still built inside the `.map(f => …)` closure so each card uses its own coords). Drop `.toFixed(6)` so the link matches the coords shown in the row text.

### 2. "Alerts Dispatched" counter (real, session-scoped)
Lift dispatch state to the dashboard so the header and feed stay in sync.

- `routes/_authenticated/index.tsx` — add `const [dispatchCount, setDispatchCount] = useState(0)`; pass `dispatchCount` to `StatusHeader` and `onDispatched={() => setDispatchCount(c => c + 1)}` to `DispatchFeed`.
- `DispatchFeed.tsx` — accept `onDispatched?: () => void`; call it inside `handleDispatch` only on the success branch (when `r.ok` and the id wasn't already in `dispatched`).
- `StatusHeader.tsx` — accept `dispatchCount?: number`; rename the third `Counter` to **"Alerts Dispatched"**, value `String(dispatchCount ?? 0)`, sub `"Session dispatches"`. Remove the hard-coded `12` / `9 en route · 3 on-site`.

Other counters in the header are out of scope for this turn (user only flagged this card).

### 3. Real "Ignitions by Hour" chart (`HourlyChart.tsx`)
Make the chart a pure function of the live FIRMS fires.

- Change signature to `HourlyChart({ fires }: { fires: LiveFire[] })`. Dashboard already has `fires`; pass it through.
- Delete the hard-coded `DATA` constant and the `142` / `118` / `2,847` callout cards.
- Inside the component, `useMemo` to build a 24-bucket array from `fires`:
  - Parse `acq_time` ("HHMM", zero-padded to 4 chars) → `hour = Number(padded.slice(0,2))`. Skip rows where the parse isn't a finite `0–23`.
  - Bucket counts per hour, render `[{ hour, label: "HH:00", count }]` into the existing `<BarChart>`.
  - `barColor` keyed off the actual computed max (e.g. red for the top bucket, amber for ≥50% of max, emerald otherwise) — no hard-coded hour highlights.
- Replace the right-hand callout column with one real tile: label `"Plotted ignitions"`, value = `fires.length` (or sum of buckets), sub `"From live NASA FIRMS acq_time"`. If `fires.length === 0`, render an empty-state message instead of bars ("Awaiting FIRMS uplink — no ignitions to plot").

If at implementation time `acq_time` turns out to be missing/unparseable on the live payload, the fallback per the user's rule is to delete the `<HourlyChart />` section from `routes/_authenticated/index.tsx` entirely rather than show mock bars. The current `LiveFire` type exposes `acqTime` as a string, so this fallback is not expected to trigger.

### Files touched
- edit: `src/components/dashboard/DispatchFeed.tsx`
- edit: `src/components/dashboard/StatusHeader.tsx`
- edit: `src/components/dashboard/HourlyChart.tsx`
- edit: `src/routes/_authenticated/index.tsx`

No backend, schema, or routing changes.
