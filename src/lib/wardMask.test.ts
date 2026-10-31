import { describe, expect, it } from "vitest";
import { loadWardCollection, computeWardMask } from "./wardMask";

// The two rules that drive dispatch behavior:
//  1) A fire inside ANY MC Ludhiana ward boundary is urban -> suppressed.
//  2) Only fires outside all ward boundaries remain active.

describe("computeWardMask", () => {
  it("loads the official ward asset", async () => {
    const wards = await loadWardCollection();
    expect(wards.features.length).toBeGreaterThan(80);
    expect(wards.type).toBe("FeatureCollection");
  });

  it("suppresses a fire inside a ward boundary (Ludhiana city centre)", async () => {
    const wards = await loadWardCollection();
    // City centre of Ludhiana — inside the MC wards.
    const r = computeWardMask([{ id: "in-city", lat: 30.9010, lng: 75.8573 }], wards);
    expect(r.suppressedIds.has("in-city")).toBe(true);
    expect(r.wardById.get("in-city")).toMatch(/^Ward \d+$/);
  });

  it("keeps a fire outside all ward boundaries active (rural farmland)", async () => {
    const wards = await loadWardCollection();
    // South-east of the MC boundary, agricultural land near Ahmedgarh road.
    const r = computeWardMask([{ id: "rural", lat: 30.74, lng: 76.03 }], wards);
    expect(r.suppressedIds.has("rural")).toBe(false);
    expect(r.wardById.has("rural")).toBe(false);
  });
});
