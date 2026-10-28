import OpeningHours from "opening_hours";
import { describe, expect, it } from "vitest";
import type { OpeningHoursLib } from "../../src/core/hours";
import { addToList, createList, deleteList, listFor, listPlaceFits, moodsOf, normalizeList, removeFromList, renameList, setPlaceMoods, starterLists, toPlace, toSaved, type ListPickContext } from "../../src/core/lists";
import { DEFAULT_SETTINGS, loadLists, loadSettings, memoryStore, PREFIX, saveLists } from "../../src/core/storage";
import type { SavedPlace, Settings, Tags } from "../../src/core/types";

const home = { lat: 52.52, lon: 13.405, label: "Mitte", cc: "de", state: "Berlin" };
let n = 0;
const saved = (tags: Tags, north = 0.002): SavedPlace => toSaved({ id: `node/${++n}`, name: tags.name || "P" + n, lat: home.lat + north, lon: home.lon, tags });
const ctx = (s: Partial<Settings> = {}, rejected: string[] = []): ListPickContext => ({
  settings: { ...DEFAULT_SETTINGS, loc: home, source: "list", ...s }, rejected: new Set(rejected),
  now: new Date("2026-10-24T19:00:00+02:00"), hoursLib: OpeningHours as unknown as OpeningHoursLib
});

describe("moods of a place", () => {
  it("are detected from the map data", () => {
    expect(moodsOf({ amenity: "restaurant" })).toEqual(["food"]);
    expect(moodsOf({ amenity: "bar" })).toEqual(["drinks"]);
    expect(moodsOf({ amenity: "nightclub" })).toEqual(["clubs"]);
    expect(moodsOf({ tourism: "museum" })).toEqual(["culture"]);
    expect(moodsOf({ shop: "bakery" })).toEqual([]);
  });
  it("can be set by hand when saving", () => {
    expect(toSaved({ id: "x", name: "X", lat: 1, lon: 2, tags: {} }, ["nature"]).moods).toEqual(["nature"]);
  });
});

describe("list operations", () => {
  it("there is always a starter list", () => {
    expect(starterLists()).toEqual([{ id: "favorites", name: "Our favorites", places: [] }]);
  });
  it("create, rename, add once, remove, change moods, delete", () => {
    let lists = starterLists();
    const made = createList(lists, "  Lunch spots ");
    lists = made.lists;
    expect(lists.map(l => l.name)).toEqual(["Our favorites", "Lunch spots"]);
    lists = renameList(lists, made.id, "Lunch");
    lists = renameList(lists, made.id, "   ");
    expect(listFor(lists, made.id).name).toBe("Lunch");
    const p = saved({ amenity: "restaurant", name: "Noodle Bar" });
    lists = addToList(lists, made.id, p);
    lists = addToList(lists, made.id, { ...p, name: "Duplicate" });
    expect(listFor(lists, made.id).places.map(x => x.name)).toEqual(["Noodle Bar"]);
    lists = setPlaceMoods(lists, made.id, p.id, ["food", "drinks"]);
    expect(listFor(lists, made.id).places[0].moods).toEqual(["food", "drinks"]);
    lists = removeFromList(lists, made.id, p.id);
    expect(listFor(lists, made.id).places).toEqual([]);
    lists = deleteList(lists, made.id);
    expect(lists.map(l => l.name)).toEqual(["Our favorites"]);
  });
  it("the last list is emptied, not deleted", () => {
    const lists = addToList(starterLists(), "favorites", saved({ amenity: "cafe" }));
    expect(deleteList(lists, "favorites")).toEqual(starterLists());
  });
  it("an unknown list id falls back to the first list", () => {
    expect(listFor(starterLists(), "gone").id).toBe("favorites");
  });
});

describe("picking from a list", () => {
  const thai = saved({ amenity: "restaurant", name: "Thai Corner", cuisine: "thai" }, 0.01);          // ~16 min on foot
  const italian = saved({ amenity: "restaurant", name: "Nonna", cuisine: "italian" }, 0.005);
  const farThai = saved({ amenity: "restaurant", name: "Far Thai", cuisine: "thai" }, 0.3);
  const bar = saved({ amenity: "bar", name: "Corner Bar" });
  const fits = (p: SavedPlace, s: Partial<Settings>, rejected: string[] = []) => listPlaceFits(p, ctx(s, rejected));

  it("“15 minutes on foot, Asian food” finds the one that fits", () => {
    const s: Partial<Settings> = { moods: ["food"], refine: { food: ["asian"] }, mode: "foot", time: 20 };
    expect([thai, italian, farThai, bar].filter(p => fits(p, s)).map(p => p.name)).toEqual(["Thai Corner"]);
  });
  it("“any distance” drops the travel limit", () => {
    const s: Partial<Settings> = { moods: ["food"], refine: { food: ["asian"] }, mode: "foot", time: 20, anyDistance: true };
    expect([thai, italian, farThai, bar].filter(p => fits(p, s)).map(p => p.name)).toEqual(["Thai Corner", "Far Thai"]);
  });
  it("with no mood picked, anything on the list goes", () => {
    expect([thai, italian, bar].filter(p => fits(p, { moods: [], time: 30 })).map(p => p.name)).toEqual(["Thai Corner", "Nonna", "Corner Bar"]);
  });
  it("a place with no mood only comes up when no mood is picked", () => {
    const odd = saved({ shop: "books", name: "Bookshop" });
    expect(fits(odd, { moods: ["food"] })).toBe(false);
    expect(fits(odd, { moods: [] })).toBe(true);
  });
  it("still respects opening hours and vetoes, but not chains or past visits", () => {
    const closed = saved({ amenity: "restaurant", opening_hours: "Mo-Su 11:00-15:00" });
    expect(fits(closed, { moods: ["food"] })).toBe(false);
    expect(fits(closed, { moods: ["food"], skipClosed: false })).toBe(true);
    expect(fits(italian, { moods: ["food"] }, [italian.id])).toBe(false);
    expect(fits(saved({ amenity: "restaurant", brand: "Big Chain" }), { moods: ["food"] })).toBe(true);
  });
  it("needs a starting point unless distance doesn’t matter", () => {
    expect(fits(italian, { moods: ["food"], loc: null })).toBe(false);
    expect(fits(italian, { moods: ["food"], loc: null, anyDistance: true })).toBe(true);
  });
  it("is picked under the mood it fits", () => {
    const both = { ...saved({ amenity: "pub", name: "Pub Grub", cuisine: "burger" }), moods: ["food", "drinks"] as SavedPlace["moods"] };
    expect(toPlace(both, { ...DEFAULT_SETTINGS, moods: ["drinks"] }).mood).toBe("drinks");
  });
});

describe("saved lists", () => {
  it("start with the starter list and round-trip", () => {
    const store = memoryStore();
    expect(loadLists(store)).toEqual(starterLists());
    const lists = addToList(starterLists(), "favorites", saved({ amenity: "cafe", name: "Kaffee" }));
    saveLists(store, lists);
    expect(loadLists(store)).toEqual(lists);
  });
  it("repair damaged entries", () => {
    const store = memoryStore();
    store.set(PREFIX + "lists", JSON.stringify([{ id: "a", name: "A", places: [{ id: "n/1", name: "Ok", lat: 1, lon: 2, tags: { amenity: "bar" } }, { name: "broken" }] }, { nonsense: true }]));
    const lists = loadLists(store);
    expect(lists).toHaveLength(1);
    expect(lists[0].places.map(p => [p.name, p.moods])).toEqual([["Ok", ["drinks"]]]);
    expect(normalizeList(null)).toBeNull();
  });
  it("older settings get the new options with safe defaults", () => {
    const store = memoryStore();
    store.set(PREFIX + "settings", JSON.stringify({ nameA: "Alex", source: "moon" }));
    expect(loadSettings(store)).toMatchObject({ nameA: "Alex", source: "map", listId: null, anyDistance: false });
  });
});
