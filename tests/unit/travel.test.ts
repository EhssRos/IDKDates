import { describe, expect, it } from "vitest";
import { distKm, fmtKm, radiusKm, radiusM, travelMin } from "../../src/core/travel";

describe("travel", () => {
  it("estimates minutes from distance", () => {
    expect(travelMin(1, "foot")).toBeCloseTo(16.25, 2);
    expect(travelMin(0, "car")).toBe(5);
  });
  it("reach and travel time agree", () => {
    expect(radiusKm(20, "bike")).toBeCloseTo(3.846, 2);
    for (const m of ["foot", "bike", "car"] as const) expect(travelMin(radiusKm(30, m), m)).toBeCloseTo(30, 5);
  });
  it("never searches a tiny or huge area", () => {
    expect(radiusKm(5, "car")).toBeGreaterThanOrEqual(0.3);
    expect(radiusM(90, "car")).toBeLessThanOrEqual(40000);
    expect(radiusM(600, "car")).toBe(40000);
  });
  it("measures Berlin to Hamburg at about 255 km", () => {
    const km = distKm({ lat: 52.52, lon: 13.405 }, { lat: 53.5511, lon: 9.9937 });
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(260);
  });
  it("formats distances for people", () => {
    expect([0.31, 2.44, 12.3].map(fmtKm)).toEqual(["310 m", "2.4 km", "12 km"]);
  });
});
