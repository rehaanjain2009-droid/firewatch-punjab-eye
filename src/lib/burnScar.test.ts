import { describe, expect, it } from "vitest";
import { addDays, classifyVerdict, compensationSlabInr, hectaresToAcres } from "./burnScar";

describe("burn scar verdict", () => {
  it("waits for imagery when no post-fire pass exists", () => {
    expect(classifyVerdict({ preScenes: 4, postScenes: 0, clearFraction: 0, burnedHa: 0 })).toBe("awaiting_imagery");
  });
  it("is inconclusive when under 30% of the audit circle is clear", () => {
    expect(classifyVerdict({ preScenes: 4, postScenes: 1, clearFraction: 0.29, burnedHa: 5 })).toBe("insufficient_clear");
  });
  it("confirms a scar of at least 0.2 ha", () => {
    expect(classifyVerdict({ preScenes: 4, postScenes: 1, clearFraction: 0.9, burnedHa: 0.2 })).toBe("confirmed");
    expect(classifyVerdict({ preScenes: 4, postScenes: 1, clearFraction: 0.9, burnedHa: 0.19 })).toBe("not_detected");
  });
});

describe("area and compensation", () => {
  it("converts hectares to acres", () => {
    expect(hectaresToAcres(1)).toBe(2.47);
    expect(hectaresToAcres(6.9)).toBe(17.05);
  });
  it("applies the indicative per-incident slabs", () => {
    expect(compensationSlabInr(1.99)).toBe(5000);
    expect(compensationSlabInr(2)).toBe(10000);
    expect(compensationSlabInr(5)).toBe(10000);
    expect(compensationSlabInr(5.01)).toBe(30000);
  });
  it("shifts ISO dates across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-15", -20)).toBe("2026-09-25");
  });
});
