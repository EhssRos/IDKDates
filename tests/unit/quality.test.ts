import { describe, expect, it } from "vitest";
import { kindOf } from "../../src/core/describe";
import { refineOk } from "../../src/core/filters";
import { boxArea, worthATrip } from "../../src/core/quality";
import type { MoodId, Tags } from "../../src/core/types";
import { parseElements } from "../../src/data/overpass";

const ha = 10000;
const worth = (tags: Tags, area?: number) => worthATrip({ tags, area });

describe("worth a trip", () => {
  it("leaves out backyard ponds but keeps lakes", () => {
    expect(worth({ natural: "water", water: "pond" }, 400)).toBe(false);
    expect(worth({ natural: "water" }, 0.5 * ha)).toBe(false);
    expect(worth({ natural: "water" }, 50 * ha)).toBe(true);
    expect(worth({ natural: "water" })).toBe(false);
    expect(worth({ natural: "water", wikidata: "Q1" })).toBe(true);
  });
  it("leaves out pocket parks and private gardens, keeps real parks and botanical gardens", () => {
    expect(worth({ leisure: "park" }, 0.4 * ha)).toBe(false);
    expect(worth({ leisure: "park" }, 6 * ha)).toBe(true);
    expect(worth({ leisure: "park" })).toBe(false);
    expect(worth({ leisure: "park", wikipedia: "de:Tiergarten" })).toBe(true);
    expect(worth({ leisure: "garden" }, 1 * ha)).toBe(false);
    expect(worth({ leisure: "garden", "garden:type": "botanical" })).toBe(true);
  });
  it("wants a forest to be a proper forest", () => {
    expect(worth({ landuse: "forest" }, 2 * ha)).toBe(false);
    expect(worth({ natural: "wood" }, 300 * ha)).toBe(true);
  });
  it("leaves out memorial plaques and Stolpersteine, even notable ones", () => {
    expect(worth({ historic: "memorial", memorial: "stolperstein", wikidata: "Q1" })).toBe(false);
    expect(worth({ historic: "memorial", memorial: "plaque" })).toBe(false);
    expect(worth({ historic: "memorial", "memorial:type": "stolperstein" })).toBe(false);
    expect(worth({ historic: "memorial", memorial: "statue", wikidata: "Q1" })).toBe(true);
  });
  it("doesn’t judge things that have no size rule", () => {
    expect(worth({ amenity: "restaurant" })).toBe(true);
    expect(worth({ tourism: "viewpoint" })).toBe(true);
    expect(worth({ historic: "castle" })).toBe(true);
  });
  it("measures boxes in square meters", () => {
    // About 1 km by 1 km at Berlin’s latitude.
    expect(boxArea(52.5, 13.4, 52.509, 13.41477) / 1e6).toBeCloseTo(1, 1);
  });
});

describe("history", () => {
  const history = (tags: Tags) => refineOk({ mood: "culture" as MoodId, tags }, { culture: ["history"] });
  it("finds castles, ruins, palaces, monuments and city gates", () => {
    for (const h of ["castle", "ruins", "palace", "monument", "city_gate", "archaeological_site", "monastery", "citywalls"]) expect(history({ historic: h }), h).toBe(true);
  });
  it("finds memorials, historic buildings and churches only when notable", () => {
    expect(history({ historic: "memorial" })).toBe(false);
    expect(history({ historic: "memorial", wikidata: "Q1" })).toBe(true);
    expect(history({ historic: "building", wikidata: "Q2" })).toBe(true);
  });
  it("finds history museums and historic sights", () => {
    expect(history({ tourism: "museum", museum: "history" })).toBe(true);
    expect(history({ tourism: "attraction", historic: "yes" })).toBe(true);
    expect(history({ tourism: "museum", museum: "art" })).toBe(false);
  });
});

describe("shapes from the map", () => {
  it("are placed at their middle and measured", () => {
    const [lake] = parseElements([{ type: "relation", id: 9, bounds: { minlat: 52.43, minlon: 13.16, maxlat: 52.45, maxlon: 13.19 }, tags: { name: "Big Lake", natural: "water" } }], "nature");
    expect(lake.lat).toBeCloseTo(52.44, 5);
    expect(lake.lon).toBeCloseTo(13.175, 5);
    expect(lake.area! / 1e6).toBeGreaterThan(4);
  });
});

describe("names", () => {
  it("describe new kinds of places sensibly", () => {
    expect(kindOf({ landuse: "forest" })).toBe("Forest");
    expect(kindOf({ leisure: "garden", "garden:type": "botanical" })).toBe("Botanical garden");
    expect(kindOf({ tourism: "attraction", historic: "castle" })).toBe("Castle");
    expect(kindOf({ tourism: "attraction" })).toBe("Sight");
    expect(kindOf({ leisure: "sports_centre", sport: "climbing" })).toBe("Climbing");
    expect(kindOf({ leisure: "sports_centre", sport: "swimming" })).toBe("Swimming pool");
    expect(kindOf({ tourism: "museum", historic: "building" })).toBe("Museum");
  });
});
