import { describe, expect, it } from "vitest";
import { kindOf } from "../../src/core/describe";
import { refineOk } from "../../src/core/filters";
import { normalizeList, toPlace, toSaved } from "../../src/core/lists";
import { minutesTo } from "../../src/core/picker";
import { worthATrip } from "../../src/core/quality";
import { DEFAULT_SETTINGS } from "../../src/core/storage";
import { goalFor } from "../../src/core/travel";
import type { MoodId, Place, Tags } from "../../src/core/types";

const reserves = (tags: Tags) => refineOk({ mood: "nature" as MoodId, tags }, { nature: ["wild"] });
const home = { lat: 52.52, lon: 13.405, label: "Home" };

describe("nature reserves", () => {
  it("include reserves and national parks", () => {
    expect(reserves({ leisure: "nature_reserve" })).toBe(true);
    expect(reserves({ boundary: "national_park" })).toBe(true);
    expect(reserves({ boundary: "protected_area", protect_class: "4" })).toBe(true);
    expect(reserves({ boundary: "protected_area", protect_class: "2" })).toBe(true);
  });
  it("leave out protection zones that aren’t nature to visit", () => {
    expect(reserves({ boundary: "protected_area", protect_class: "12" })).toBe(false); // water protection
    expect(reserves({ boundary: "protected_area", protect_class: "5" })).toBe(false);  // landscape protection
    expect(reserves({ boundary: "protected_area" })).toBe(false);
  });
  it("leave out strict reserves that keep visitors out", () => {
    expect(worthATrip({ tags: { leisure: "nature_reserve", protect_class: "1a", wikidata: "Q1" }, area: 900000 })).toBe(false);
  });
  it("are named sensibly", () => {
    expect(kindOf({ leisure: "nature_reserve" })).toBe("Nature reserve");
    expect(kindOf({ boundary: "protected_area", protect_class: "2" })).toBe("National park");
    expect(kindOf({ boundary: "national_park" })).toBe("National park");
  });
});

describe("big areas are measured to their nearest edge", () => {
  // A reserve 6 km across, its southern edge 1 km north of home.
  const reserve: Place = { id: "relation/1", name: "Big Reserve", mood: "nature", tags: { leisure: "nature_reserve" },
    lat: 52.556, lon: 13.405, bounds: { s: 52.529, w: 13.36, n: 52.583, e: 13.45 } };

  it("heads for the nearest edge, not the middle", () => {
    expect(goalFor(reserve, home)).toEqual({ lat: 52.529, lon: 13.405 });
    expect(minutesTo(reserve, { loc: home, mode: "foot" })).toBeLessThan(20);
    expect(minutesTo({ ...reserve, bounds: undefined }, { loc: home, mode: "foot" })).toBeGreaterThan(45);
  });
  it("heads for the middle when you’re already inside", () => {
    expect(goalFor(reserve, { lat: 52.55, lon: 13.4 })).toEqual({ lat: 52.556, lon: 13.405 });
  });
  it("points stay points", () => {
    expect(goalFor({ lat: 1, lon: 2 }, home)).toEqual({ lat: 1, lon: 2 });
  });
  it("saved places keep their shape", () => {
    const saved = toSaved({ ...reserve, area: 5e7 });
    expect(saved.bounds).toEqual(reserve.bounds);
    expect(toPlace(saved, DEFAULT_SETTINGS).bounds).toEqual(reserve.bounds);
    expect(normalizeList({ id: "x", name: "X", places: [JSON.parse(JSON.stringify(saved))] })!.places[0].bounds).toEqual(reserve.bounds);
  });
});
