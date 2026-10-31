# Project decisions

- `src/data/ludhiana_wards.json` is generated from the official MC Ludhiana ward KML (95 ward polygons). It is a build asset: regenerate it by re-running the KML-to-GeoJSON converter, never hand-edit it.
- Suppression rules live in shared browser-safe modules — `src/lib/wardMask.ts` (ward core) and `src/lib/landuseMask.ts` (OSM classes, bbox, dispatch threshold) — used by both the dashboard and the cron dispatch route, so the UI and hourly job can never disagree.
- Officer assignment (`src/lib/officerMatch.ts`, nearest located village in `officer_directory`) and the stable `incidentKey` are shared by the dashboard, server functions and cron. Why: cards, Telegram text and audit rows must name the same officers and incident.
- `officer_directory` village coordinates were matched offline from OSM place nodes (fuzzy name match, rejected if > 25 km from the block centroid); rows without a confident match keep NULL lat/lng and are skipped by the matcher. Re-import by re-running that matcher, never by guessing coordinates.
- Incident lifecycle goes through `src/lib/incidents.server.ts`; dispatch dedup is the `claim_incident_dispatch` DB function, not in-memory state. Why: workers are stateless and the browser trigger and cron would otherwise double-send.
- `incidents_audit_log` is append-only by design: DB triggers freeze detection fields, append every status change to `status_history`, and block DELETE. Proof photos live in the private `incident-proofs` bucket, stored as object paths and shown via signed URLs.
- Suppression is always applied; the map's mask toggle only hides overlays. Why: the cron job cannot see a UI toggle, so a toggle-dependent mask would make the feed and Telegram disagree.
- Nominatim reverse geocoding (`useCroplandMask`) only provides place labels; it never suppresses fires.
