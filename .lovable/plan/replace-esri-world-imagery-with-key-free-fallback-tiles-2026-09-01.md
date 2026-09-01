# Replace Esri World Imagery with key-free fallback tiles

## Goal
Eliminate any potential "API KEY REQUIRED" watermark from the dashboard by replacing the Esri World Imagery fallback with a free, no-key tile provider and, where possible, using the live GEE tile instead.

## Changes

1. MapView Sentinel-2 NIR fallback
   - Replace the Esri World Imagery `TileLayer` URL in the `active.has("nbr")` fallback branch with a free provider (e.g., OpenStreetMap standard or CartoDB Voyager).
   - Update the `attribution` prop to match the new provider.

2. BurnScarMiniMap real optical layer
   - Replace the Esri World Imagery `TileLayer` URL with the same free provider.
   - Add a proper `attribution` prop (currently missing).
   - Optionally accept the live GEE tile URL as a prop and use it when available, falling back to the free provider only when GEE is unavailable.

3. Dashboard wiring
   - Pass the active GEE NBR/Sentinel tile URL from the dashboard state down to `BurnScarModal` → `BurnScarMiniMap` so the modal can show the best available layer.

4. Verification
   - Confirm no `server.arcgisonline.com` or `arcgisonline.com` URLs remain in the source.
   - Check that the main map and the burn-scar modal still render tiles and the fire marker correctly in Demo Mode.
