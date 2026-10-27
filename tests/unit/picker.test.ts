import OpeningHours from "opening_hours";
import { describe, expect, it } from "vitest";
import type { OpeningHoursLib } from "../../src/core/hours";
import { eligible, shuffle, weight, weightedPick, type PickContext } from "../../src/core/picker";
import { DEFAULT_SETTINGS } from "../../src/core/storage";
import type { Place, Settings, Tags } from "../../src/core/types";

const home = { lat: 52.52, lon: 13.405, label: "Mitte", cc: "de", state: "Berlin" };
let n = 0;
const place = (tags: Tags, north = 0.002): Place => ({ id: `node/${++n}`, name: tags.name || "P" + n, lat: home.lat + north, lon: home.lon, mood: "food", tags: { amenity: "restaurant", ...tags } });
const ctx = (s: Partial<Settings> = {}, extra: Partial<PickContext> = {}): PickContext => ({
  settings: { ...DEFAULT_SETTINGS, loc: home, ...s }, visited: new Set(), rejected: new Set(),
  now: new Date("2026-10-24T19:00:00+02:00"), hoursLib: OpeningHours as unknown as OpeningHoursLib, ...extra
});
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe("picking", () => {
  it("respects reach", () => {
    expect(eligible(place({}, 0.01), ctx({ mode: "bike", time: 10 }))).toBe(true);
    expect(eligible(place({}, 0.2), ctx({ mode: "bike", time: 10 }))).toBe(false);
  });
  it("skips chains, visited and turned-down places only when asked", () => {
    const chain = place({ brand: "Burger Giant" });
    expect(eligible(chain, ctx())).toBe(false);
    expect(eligible(chain, ctx({ skipChains: false }))).toBe(true);
    const been = place({});
    expect(eligible(been, ctx({}, { visited: new Set([been.id]) }))).toBe(false);
    expect(eligible(been, ctx({ skipBeen: false }, { visited: new Set([been.id]) }))).toBe(true);
    expect(eligible(been, ctx({ skipBeen: false }, { rejected: new Set([been.id]) }))).toBe(false);
  });
  it("judges opening hours at arrival", () => {
    // About 20 minutes on foot; opens 19:15.
    const opensSoon = place({ opening_hours: "Mo-Su 19:15-23:00" }, 0.0111);
    expect(eligible(opensSoon, ctx({ mode: "foot", time: 25 }))).toBe(true);
    expect(eligible(place({ opening_hours: "Mo-Su 19:15-23:00" }), ctx({ mode: "car", time: 25 }))).toBe(false);
    expect(eligible(place({ opening_hours: "Mo-Su 11:00-15:00" }), ctx({ skipClosed: false }))).toBe(true);
    expect(eligible(place({}), ctx())).toBe(true);
  });
  it("applies filters", () => {
    expect(eligible(place({ cuisine: "thai" }), ctx({ refine: { food: ["italian"] } }))).toBe(false);
    expect(eligible(place({ cuisine: "italian" }), ctx({ refine: { food: ["italian"] } }))).toBe(true);
  });
  it("needs a starting point", () => {
    expect(eligible(place({}), ctx({ loc: null }))).toBe(false);
  });
  it("favors well documented places", () => {
    expect(weight({ tags: { wikidata: "Q1", website: "x", opening_hours: "24/7" } })).toBeGreaterThan(weight({ tags: {} }));
    expect(weight({ tags: { leisure: "park" } })).toBeLessThan(weight({ tags: {} }));
    const list: { tags: Tags; name: "plain" | "rich" }[] = [{ tags: {}, name: "plain" }, { tags: { wikidata: "Q1", website: "x" }, name: "rich" }];
    const rng = seeded(7);
    const counts = { plain: 0, rich: 0 };
    for (let i = 0; i < 2000; i++) counts[weightedPick(list, rng).name]++;
    expect(counts.rich / 2000).toBeGreaterThan(0.7);
    expect(counts.plain).toBeGreaterThan(0);
  });
  it("shuffles without losing anything", () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(3)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
