# Fix: Cropland mask wiping the map

## Root cause

In `src/hooks/useCroplandMask.ts` the rule is *"suppress unless explicitly cropland (WorldCover = 40) AND not in urban polygon"*. Any fire whose GEE point sample returns `null`, times out, or is classified as anything other than `40` (trees, shrub, grassland, bare, etc.) is dropped. With the current FIRMS payload most points land on mixed or non-cropland pixels and the map goes blank.

Coordinate order in the existing code (`point([lng, lat])`) is actually correct, but we'll harden it and log it per the user's request.

## Changes

### 1. `src/hooks/useCroplandMask.ts` — invert the rule
Replace the "must be cropland" gate with an "only suppress on confirmed urban/built" gate:

- Suppress a fire **only when** one of the following is true:
  - `inUrban(lat, lng) === true` (inside the Ludhiana urban polygon), OR
  - `landCover` is a **confirmed built/water class**: `50` (built-up), `80` (water). Anything else (including `null`, `undefined`, `30` grassland, `40` cropland, classification errors) → keep the fire.
- Per-fire debug log:
  ```ts
  console.debug('[cropland-mask]', {
    id, firmsCoords: [lat, lng], turfCoords: [lng, lat],
    landCover: lc, urban, suppressed,
  });
  ```
- Keep the `LUDHIANA_URBAN` polygon (already within the requested 74.5–76.5 E / 30.0–31.5 N envelope: 75.78–75.94 E, 30.85–30.96 N). Add an assertion comment documenting the lng-first ring order so it can't be flipped by a future edit.
- Helper `toTurfCoord(lat, lng): [number, number]` returns `[lng, lat]`; use it everywhere Turf is called.

### 2. `src/lib/cropland.server.ts` — keep behavior, document fallback
No logic change required, but add a code comment that `landCover: null` means "unknown / API failure, do NOT suppress". The client now respects that.

### 3. `src/routes/_authenticated/index.tsx` — safe default
Currently: `visibleFires = maskEnabled && mask.ready && mask.ok ? fires.filter(...) : fires`. The filter call uses `croplandIds`, which under the new rule will be "all fires minus confirmed urban/water". Switch the derivation to use the new `suppressedIds` directly:

```ts
const visibleFires = maskEnabled && mask.ready && mask.ok
  ? fires.filter(f => !mask.suppressedIds.has(f.id))
  : fires;
```

This guarantees: classification error → fire stays visible; only positively-identified urban/water gets hidden.

### 4. Hook return shape
`CroplandMask` keeps the same shape; `croplandIds` becomes "fires positively kept" (informational), `suppressedIds` is the single source of truth for hiding.

### 5. Debug log toggle
Logs gated behind `if (import.meta.env.DEV)` so production stays quiet, but visible in the user's browser console during this audit.

## Files touched
- edited: `src/hooks/useCroplandMask.ts`
- edited: `src/routes/_authenticated/index.tsx`
- edited: `src/lib/cropland.server.ts` (comment only)

No new dependencies, no backend or schema changes.
