import { describe, expect, it } from "vitest";
import { avgRating, filterVisits, groupByMonth, timelineSummary } from "../../src/core/timeline";
import type { Visit } from "../../src/core/types";

const v = (o: Partial<Visit>): Visit => ({ visit: Math.random().toString(36), placeId: "", name: "X", kind: "", mood: "", lat: null, lon: null,
  date: Date.parse("2026-10-17T20:00:00+02:00"), loved: false, ratings: { a: 0, b: 0 }, note: "", ...o });

describe("timeline", () => {
  it("averages only what was rated", () => {
    expect([avgRating(v({})), avgRating(v({ ratings: { a: 4, b: 0 } })), avgRating(v({ ratings: { a: 4, b: 5 } }))]).toEqual([0, 4, 4.5]);
  });
  it("filters and sorts newest first", () => {
    const list = [v({ name: "Old", date: 1, loved: true }), v({ name: "Top", date: 3, ratings: { a: 5, b: 4 } }), v({ name: "Meh", date: 2, ratings: { a: 3, b: 3 } })];
    expect(filterVisits(list, "all").map(x => x.name)).toEqual(["Top", "Meh", "Old"]);
    expect(filterVisits(list, "loved").map(x => x.name)).toEqual(["Old"]);
    expect(filterVisits(list, "top").map(x => x.name)).toEqual(["Top"]);
    expect(filterVisits(list, "unrated").map(x => x.name)).toEqual(["Old"]);
  });
  it("groups by month", () => {
    const g = groupByMonth([v({ date: Date.parse("2026-10-23") }), v({ date: Date.parse("2026-10-02") }), v({ date: Date.parse("2026-09-05") })], "en-US");
    expect(g.map(x => [x.month, x.visits.length])).toEqual([["October 2026", 2], ["September 2026", 1]]);
  });
  it("sums it up", () => {
    expect(timelineSummary([])).toBe("");
    expect(timelineSummary([v({ date: Date.parse("2026-09-05") })], "en-US")).toBe("1 outing together since September 2026.");
    expect(timelineSummary([v({ name: "Ramen", ratings: { a: 5, b: 4 } }), v({ name: "Bowling", ratings: { a: 3, b: 0 } })], "en-US"))
      .toBe("2 outings together since October 2026. Average rating 3.8. Favorite so far: Ramen.");
  });
});
