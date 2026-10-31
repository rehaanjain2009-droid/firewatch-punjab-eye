import { describe, expect, it } from "vitest";
import {
  classifyOsmTags,
  computeLanduseMask,
  shouldAutoDispatch,
  type IndustrialFeature,
} from "./landuseMask";

// Small square around a point, [lng, lat] ring.
const square = (lat: number, lng: number, d = 0.005): [number, number][] => [
  [lng - d, lat - d],
  [lng + d, lat - d],
  [lng + d, lat + d],
  [lng - d, lat + d],
  [lng - d, lat - d],
];

describe("auto-dispatch threshold (>= 70%)", () => {
  it("dispatches a VIIRS nominal / exactly 70% fire", () => {
    expect(shouldAutoDispatch(70)).toBe(true);
  });
  it("does not dispatch a 69% fire", () => {
    expect(shouldAutoDispatch(69)).toBe(false);
  });
});

describe("OSM tag classification", () => {
  it("brick kilns suppress", () => {
    expect(classifyOsmTags({ man_made: "kiln" })).toBe("brick_kiln");
    expect(classifyOsmTags({ industrial: "brick_kiln" })).toBe("brick_kiln");
  });
  it("farmland and forest never suppress", () => {
    expect(classifyOsmTags({ landuse: "farmland" })).toBeNull();
    expect(classifyOsmTags({ landuse: "forest" })).toBeNull();
  });
  it("industrial land suppresses", () => {
    expect(classifyOsmTags({ landuse: "industrial" })).toBe("industrial");
  });
  it("rural village residential / commercial tags never suppress", () => {
    expect(classifyOsmTags({ landuse: "residential" })).toBeNull();
    expect(classifyOsmTags({ landuse: "commercial" })).toBeNull();
  });
});

describe("computeLanduseMask", () => {
  const features: IndustrialFeature[] = [
    { id: "w1", name: "Focal Point", landuse: "industrial", ring: square(30.886, 75.915) },
  ];

  it("suppresses a fire inside an industrial polygon", () => {
    const r = computeLanduseMask([{ id: "factory", lat: 30.886, lng: 75.915 }], features);
    expect(r.suppressedIds.has("factory")).toBe(true);
  });

  it("keeps a fire on farmland outside every polygon active", () => {
    const r = computeLanduseMask([{ id: "farm", lat: 30.74, lng: 76.03 }], features);
    expect(r.suppressedIds.has("farm")).toBe(false);
  });
});
