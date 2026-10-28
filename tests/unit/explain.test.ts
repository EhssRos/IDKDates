import { describe, expect, it } from "vitest";
import { leftOutSummary, leftOutText, suggestFixes } from "../../src/core/explain";
import { countLeftOut, leftOut, type PickContext } from "../../src/core/picker";
import { DEFAULT_SETTINGS } from "../../src/core/storage";
import type { Place, Settings } from "../../src/core/types";

const s = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, loc: { lat: 52.52, lon: 13.405, label: "Mitte" }, ...o });
const now = new Date("2026-10-27T22:40:00+01:00");

describe("why nothing fits", () => {
  it("names the reason for one place", () => {
    expect(leftOutText({ why: "tooFar", minutes: 31.4 }, s({ mode: "foot", time: 20 }))).toBe("about 31 min on foot, more than your 20 min");
    expect(leftOutText({ why: "tooFar", minutes: 361 }, s({ mode: "foot", time: 20 }))).toBe("about 6 hours on foot, more than your 20 min");
    expect(leftOutText({ why: "closed", opens: new Date("2026-10-28T12:00:00+01:00"), closingSoon: false }, s(), now, "de-DE")).toBe("closed when you’d get there, opens tomorrow at 12:00");
    expect(leftOutText({ why: "closed", opens: new Date("2026-10-30T17:00:00+01:00"), closingSoon: false }, s(), now, "en-GB")).toBe("closed when you’d get there, opens Friday at 17:00");
    expect(leftOutText({ why: "closed", opens: null, closingSoon: true }, s())).toBe("closes soon after you’d get there");
    expect(leftOutText({ why: "mood" }, s({ moods: ["food", "drinks"] }))).toBe("isn’t marked as Food or Drinks & coffee");
  });

  it("sums up the reasons, most common first", () => {
    const counts = countLeftOut([{ why: "tooFar", minutes: 40 }, { why: "chain" }, { why: "tooFar", minutes: 50 }, null, { why: "closed", opens: null, closingSoon: false }]);
    expect(counts).toEqual({ tooFar: 2, chain: 1, closed: 1 });
    expect(leftOutSummary(counts, s({ time: 20 }))).toEqual([
      "2 are more than 20 min by bike away", "1 is a big chain", "1 is closed or closing soon when you’d arrive"
    ]);
  });

  it("suggests the fixes that would help most", () => {
    expect(suggestFixes({ closed: 5, tooFar: 2, chain: 1, visited: 1 }, s({ time: 20 }))).toEqual([
      { label: "Include closed places", patch: { skipClosed: false } },
      { label: "Go up to 35 min", patch: { time: 35 } },
      { label: "Include chains", patch: { skipChains: false } }
    ]);
    expect(suggestFixes({ tooFar: 3 }, s({ source: "list" }))).toEqual([{ label: "Any distance", patch: { anyDistance: true } }]);
    expect(suggestFixes({ tooFar: 3 }, s({ time: 90 }))).toEqual([]);
    expect(suggestFixes({ closed: 3 }, s({ skipClosed: false }))).toEqual([]);
  });

  it("the picker reports the first reason that applies", () => {
    const p: Place = { id: "node/1", name: "X", lat: 52.6, lon: 13.405, mood: "food", tags: { amenity: "restaurant", brand: "Big" } };
    const ctx = (o: Partial<Settings>): PickContext => ({ settings: s(o), visited: new Set(), rejected: new Set(), now, hoursLib: null });
    expect(leftOut(p, ctx({}))?.why).toBe("chain");
    expect(leftOut(p, ctx({ skipChains: false }))).toMatchObject({ why: "tooFar" });
    expect(leftOut(p, ctx({ skipChains: false, time: 90, mode: "car" }))).toBeNull();
  });
});
