import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadHistory, loadSettings, memoryStore, migrate, PREFIX, saveHistory, saveSettings } from "../../src/core/storage";

describe("saved data", () => {
  it("starts with sensible defaults", () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
    expect(loadHistory(memoryStore())).toEqual([]);
  });
  it("round-trips settings and visits", () => {
    const s = memoryStore();
    saveSettings(s, { ...DEFAULT_SETTINGS, moods: ["nature"], nameA: "Alex" });
    expect(loadSettings(s)).toMatchObject({ moods: ["nature"], nameA: "Alex" });
    const visit = { visit: "v1", placeId: "node/1", name: "A", kind: "Bar", mood: "drinks" as const, lat: 1, lon: 2, date: 5, loved: true, ratings: { a: 3, b: 0 }, note: "n" };
    saveHistory(s, [visit]);
    expect(loadHistory(s)).toEqual([visit]);
  });
  it("carries data over from the app’s old name", () => {
    const s = memoryStore();
    s.set("eeny:v1:settings", JSON.stringify({ vibes: ["clubs", "nonsense"], nameB: "Sam" }));
    s.set("eeny:v1:history", JSON.stringify([{ id: "node/7", name: "From Before", kind: "Bar", date: 9, loved: true, vibe: "drinks" }]));
    migrate(s);
    expect(loadSettings(s)).toMatchObject({ moods: ["clubs"], nameB: "Sam" });
    expect(loadHistory(s)).toEqual([{ visit: "v9_0", placeId: "node/7", name: "From Before", kind: "Bar", mood: "drinks", lat: null, lon: null, date: 9, loved: true, ratings: { a: 0, b: 0 }, note: "" }]);
    expect(s.get(PREFIX + "schema")).toBe("2");
  });
  it("never overwrites newer data with old data", () => {
    const s = memoryStore();
    s.set(PREFIX + "settings", JSON.stringify({ nameA: "New" }));
    s.set("eeny:v1:settings", JSON.stringify({ nameA: "Old" }));
    migrate(s);
    expect(loadSettings(s).nameA).toBe("New");
  });
  it("repairs damaged or odd values", () => {
    const s = memoryStore();
    s.set(PREFIX + "settings", JSON.stringify({ mode: "rocket", time: 500, vetoCount: -2, refine: null }));
    s.set(PREFIX + "history", "{not json");
    expect(loadSettings(s)).toMatchObject({ mode: "bike", time: 90, vetoCount: 0, refine: {} });
    expect(loadHistory(s)).toEqual([]);
  });
  it("keeps working when storage is full", () => {
    const full = { get: () => null, set: () => { throw new Error("QuotaExceeded"); }, remove: () => {} };
    expect(() => saveSettings(full, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => migrate(full)).not.toThrow();
  });
});
