import { describe, expect, it } from "vitest";
import { chainTest, isNarrowed, refineOk, selectorsFor } from "../../src/core/filters";
import { MOODS, REFINE } from "../../src/core/moods";
import type { MoodId, Tags } from "../../src/core/types";
import { buildQuery } from "../../src/data/overpass";

const food = (tags: Tags) => ({ mood: "food" as MoodId, tags: { amenity: "restaurant", ...tags } });

describe("filters", () => {
  it("match tags the way the map server does", () => {
    expect(chainTest('["amenity"="bar"]')({ amenity: "bar" })).toBe(true);
    expect(chainTest('["amenity"="bar"]')({ amenity: "pub" })).toBe(false);
    const thai = chainTest('["cuisine"~"(^|;) *(thai) *(;|$)",i]');
    expect(thai({ cuisine: "Vietnamese;THAI" })).toBe(true);
    expect(thai({ cuisine: "thailandish" })).toBe(false);
    expect(thai({})).toBe(false);
    const notPrivate = chainTest('["access"!~"^(private|no)$"]');
    expect([notPrivate({}), notPrivate({ access: "private" }), notPrivate({ access: "yes" })]).toEqual([true, false, true]);
  });

  it("widen within a group and narrow across groups", () => {
    const places = [food({ cuisine: "thai" }), food({ cuisine: "thai", "diet:vegan": "yes" }), food({ cuisine: "italian" }), food({})];
    const run = (sel: string[]) => places.map(p => refineOk(p, { food: sel }));
    expect(run([])).toEqual([true, true, true, true]);
    expect(run(["asian", "italian"])).toEqual([true, true, true, false]);
    expect(run(["asian", "veggie"])).toEqual([false, true, false, false]);
    expect(run(["quick"])).toEqual([false, false, false, false]);
    expect(run(["no-such-option"])).toEqual([true, true, true, true]);
  });

  it("narrow the map query itself", () => {
    const at = { lat: 52.5, lon: 13.4 };
    const plain = buildQuery("food", {}, at, 1234);
    expect(plain).toContain('nw["amenity"~"^(restaurant|fast_food|ice_cream)$"]["name"]');
    expect(plain).toContain("(around:1234,52.5,13.4)");
    expect(plain).toContain("[bbox:");
    const refined = buildQuery("food", { food: ["asian", "veggie"] }, at, 1234);
    expect(refined).not.toContain("ice_cream)$");
    expect(refined).toMatch(/\["cuisine"~"[^"]*thai[^"]*",i\]/);
    expect(refined).toContain('["diet:vegan"~"^(yes|only)$"]');
    expect(selectorsFor("food", { food: ["bogus"] })).toEqual(MOODS.food.selectors);
  });

  it("know when anything is narrowed", () => {
    expect(isNarrowed(["food"], {})).toBe(false);
    expect(isNarrowed(["food"], { drinks: ["bar"] })).toBe(false);
    expect(isNarrowed(["food", "drinks"], { drinks: ["bar"] })).toBe(true);
  });

  it("every option has valid selectors", () => {
    const bad: string[] = [];
    for (const [m, r] of Object.entries(REFINE)) for (const [k, o] of Object.entries(r.options)) {
      if (!o.label || !o.q.length) bad.push(`${m}.${k}: empty`);
      for (const c of o.q) if (!/^(\["[^"]+"(=|~|!~)"[^"]*"(,i)?\])+$/.test(c)) bad.push(`${m}.${k}: ${c}`);
    }
    expect(bad).toEqual([]);
  });
});
