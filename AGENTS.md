# Project decisions

- `src/data/ludhiana_wards.json` is generated from the official MC Ludhiana ward KML (95 ward polygons). It is a build asset: regenerate it by re-running the KML-to-GeoJSON converter, never hand-edit it.
- Suppression rules live in shared browser-safe modules — `src/lib/wardMask.ts` (ward core) and `src/lib/landuseMask.ts` (OSM classes, bbox, dispatch threshold) — used by both the dashboard and the cron dispatch route, so the UI and hourly job can never disagree.
- Suppression is always applied; the map's mask toggle only hides overlays. Why: the cron job cannot see a UI toggle, so a toggle-dependent mask would make the feed and Telegram disagree.
- Nominatim reverse geocoding (`useCroplandMask`) only provides place labels; it never suppresses fires.
