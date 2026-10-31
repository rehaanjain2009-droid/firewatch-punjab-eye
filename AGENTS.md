# Project decisions

- `src/data/ludhiana_wards.json` is generated from the official MC Ludhiana ward KML (95 ward polygons). It is a build asset: regenerate it by re-running the KML-to-GeoJSON converter, never hand-edit it. The ward mask (`src/lib/wardMask.ts`) is the single source of truth for urban suppression and is shared by the browser mask, the map layer, and the cron dispatch route.
- Ward suppression is always applied (not gated by the map's mask toggle); the cropland and Overpass industrial masks honor the toggle.
