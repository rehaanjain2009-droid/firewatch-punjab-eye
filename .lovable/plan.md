## Six fixes + Auth/Telegram onboarding

### 1. Map popup ✕
`MapView.tsx` — drop the `fires[0]` fallback so the popup only renders when `selected` is non-null; ✕ calls `setSelected(null)`.

### 2. Auto-fit bounds
Add a `FitToFires` child using `useMap()`. 0 fires → recenter Ludhiana z10; 1 → `setView` z12; 2+ → `fitBounds(L.latLngBounds(coords), { padding:[50,50], maxZoom:12 })`. Marker-pick `flyTo` preserved.

### 3. Lock Base Map
Remove the `"base"` entry from the layer toggle list. CARTO dark `<TileLayer>` always renders. Toggle panel exposes only FIRMS / NBR / Cropland / Radar.

### 4. Per-fire GMaps link
`DispatchFeed.tsx` — build URL inside `.map(item => …)` as `https://www.google.com/maps/search/?api=1&query=${item.lat.toFixed(6)},${item.lng.toFixed(6)}` with `Number.isFinite` guard.

### 5. Honest satellite layers
- FIRMS: live toggle.
- Sentinel-2 NBR & ESA Cropland: toggle when their tile URL is present in `tiles` prop; otherwise rendered disabled with a `BACKEND REQ` badge.
- Radar: always disabled with `COMING SOON` badge.

### 6. Auth + Telegram onboarding

**Migration** — `public.profiles`:
- `user_id uuid PK references auth.users on delete cascade`, `email`, `telegram_handle`, `telegram_chat_id`, `created_at`, `updated_at`
- `GRANT SELECT,INSERT,UPDATE … TO authenticated; GRANT ALL TO service_role;`
- RLS on; user can SELECT/INSERT/UPDATE own row
- Trigger on `auth.users` insert → seeds profile with email
- `update_updated_at_column` trigger

**Providers** — `configure_social_auth(['google'])`; keep email/password.

**Routes** (integration-managed `_authenticated/route.tsx` already gates):
- `src/routes/auth.tsx` (`ssr:false`) — Sign-in / Sign-up tabs (email+password) + "Continue with Google" via `lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })`.
- Move dashboard from `src/routes/index.tsx` → `src/routes/_authenticated/index.tsx`. Loader calls `getMyProfile`; if `telegram_handle` is null → `redirect('/onboarding')`.
- `src/routes/_authenticated/onboarding.tsx` — handle input (regex `^@?[A-Za-z0-9_]{5,32}$`), clickable "Join Telegram Dispatch Group" link from `import.meta.env.VITE_TELEGRAM_INVITE_URL` (placeholder + warning when unset), Save → `upsertTelegramHandle` → navigate `/`.
- `src/routes/index.tsx` becomes a small redirect (signed-in → `/`, else `/auth`).

**Server fns** — `src/lib/profile.functions.ts`:
- `getMyProfile` (uses `requireSupabaseAuth`)
- `upsertTelegramHandle({ handle })` — Zod-validated upsert

**Header** — `StatusHeader.tsx`: email pill + sign-out (`cancelQueries → clear → supabase.auth.signOut → navigate('/auth')`).

Telegram dispatch keeps using the existing shared `TELEGRAM_CHAT_ID`. The invite link in onboarding is how new operators join that group. Per-user DM fan-out is out of scope here.

### Files
- edit: `MapView.tsx`, `DispatchFeed.tsx`, `StatusHeader.tsx`, `routes/index.tsx`
- new: `routes/auth.tsx`, `routes/_authenticated/index.tsx`, `routes/_authenticated/onboarding.tsx`, `lib/profile.functions.ts`, migration
- tools: `configure_social_auth(['google'])`

### After approval
1. Run the profiles migration.
2. Enable Google sign-in.
3. Share the Telegram group invite URL when ready; I'll set `VITE_TELEGRAM_INVITE_URL`. Until then onboarding shows a clear placeholder.