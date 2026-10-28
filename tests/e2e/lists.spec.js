// End-to-end: your own lists of places, and picking from them.
import { test, expect, place, searchHit, HOME } from "./helpers.js";

const openLists = page => page.locator("#views").getByRole("button", { name: "Lists" }).click();
const openPick = page => page.locator("#views").getByRole("button", { name: "Pick", exact: true }).click();
const fromLists = page => page.locator("#source").getByRole("button", { name: "Our lists" }).click();
const savedNames = page => page.locator(".saved .h-name");

const saved = (name, tags, north = 0.002) => ({ id: "node/" + name.length + Math.floor(north * 1e5), name, lat: HOME.lat + north, lon: HOME.lon, tags: { name, ...tags }, moods: [], added: 1 });
const favorites = (...places) => [{ id: "favorites", name: "Our favorites", places: places.map(p => ({ ...p, moods: p.moods.length ? p.moods : guessMood(p.tags) })) }];
const guessMood = t => t.amenity === "bar" ? ["drinks"] : t.tourism ? ["culture"] : ["food"];

test("there’s a list ready to fill", async ({ app, page }) => {
  await app.open();
  await openLists(page);
  await expect(page.locator("#h-list")).toHaveText("Our favorites");
  await expect(page.locator(".list-empty")).toContainText("No places yet");
});

test("search a place by name and add it", async ({ app, page, world }) => {
  world.placeSearch = [
    searchHit("Thai Corner", "amenity", "restaurant", { cuisine: "thai", opening_hours: "Mo-Su 12:00-23:00" }),
    searchHit("Thai Corner Express", "amenity", "fast_food", { cuisine: "thai" })
  ];
  await app.open();
  await app.setLocation();
  await openLists(page);
  await page.getByLabel("Search for a place to add").fill("Thai Corner");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Add Thai Corner", exact: true }).click();
  await expect(page.getByRole("button", { name: "Thai Corner is on the list" })).toBeDisabled();
  await expect(savedNames(page)).toHaveText(["Thai Corner"]);
  await expect(page.locator(".saved .h-meta")).toHaveText("Thai restaurant. Food");
  expect(world.placeSearches).toEqual(["Thai Corner"]);
  await page.reload();
  await expect(savedNames(page)).toHaveText(["Thai Corner"]);
});

test("a pick you like can be saved to your list", async ({ app, page, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Lucky Find", cuisine: "korean" })];
  await app.open();
  await app.setLocation();
  await app.pick();
  await page.getByRole("button", { name: "Save to Our favorites" }).click();
  await expect(page.getByRole("button", { name: "Saved to Our favorites" })).toBeDisabled();
  await openLists(page);
  await expect(savedNames(page)).toHaveText(["Lucky Find"]);
});

test("a place from your timeline can be saved to your list", async ({ app, page }) => {
  await app.seed("history", [{ visit: "v1", placeId: "node/5", name: "Old Haunt", kind: "Bar", mood: "drinks", lat: HOME.lat, lon: HOME.lon, date: Date.parse("2026-10-10T20:00:00+02:00"), loved: true, ratings: { a: 5, b: 5 }, note: "" }]);
  await app.open("#timeline");
  await page.locator(".tl-head").click();
  await page.getByRole("button", { name: "Save to Our favorites" }).click();
  await openLists(page);
  await expect(savedNames(page)).toHaveText(["Old Haunt"]);
  await expect(page.locator(".saved .h-meta")).toContainText("Drinks & coffee");
});

test("“15 minutes on foot, Asian food”: there’s only one, and it picks it without asking the map", async ({ app, page, world }) => {
  await app.seed("lists", favorites(
    saved("Thai Corner", { amenity: "restaurant", cuisine: "thai" }, 0.008),
    saved("Nonna", { amenity: "restaurant", cuisine: "italian" }, 0.004),
    saved("Far Away Pho", { amenity: "restaurant", cuisine: "vietnamese" }, 0.2),
    saved("Corner Bar", { amenity: "bar" }, 0.002)
  ));
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await app.mode("Foot");
  await app.travel(15);
  await app.refine("Asian").click();
  for (let i = 0; i < 3; i++) {
    await app.pick();
    await expect(page.locator(".t-name")).toHaveText("Thai Corner");
  }
  await expect(app.ticket()).toContainText("Thai restaurant, from Our favorites");
  await expect(page.locator(".verdict")).toHaveText("Picked from 1 place on “Our favorites” that fits.");
  expect(world.queries).toEqual([]);
});

test("“Any distance” picks any fitting place on the list", async ({ app, page }) => {
  await app.seed("lists", favorites(
    saved("Thai Corner", { amenity: "restaurant", cuisine: "thai" }, 0.008),
    saved("Far Away Pho", { amenity: "restaurant", cuisine: "vietnamese" }, 0.2)
  ));
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await app.mode("Foot");
  await app.travel(15);
  await page.getByLabel("Any distance, we don’t mind").check();
  await expect(page.locator("#timeOut")).toHaveText("Any distance");
  expect(await app.pickMany(10)).toEqual(new Set(["Thai Corner", "Far Away Pho"]));
});

test("with no mood picked, anything on the list goes", async ({ app, page }) => {
  await app.seed("lists", favorites(saved("Museum Island", { tourism: "museum" }), saved("Corner Bar", { amenity: "bar" })));
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await app.mood("Food").click();
  await expect(page.locator("#sourceHint")).toContainText("anything on the list goes");
  expect(await app.pickMany(10)).toEqual(new Set(["Museum Island", "Corner Bar"]));
});

test("places you’ve been to and chains still count when they’re on your list", async ({ app, page }) => {
  await app.seed("lists", favorites(saved("Burger Giant", { amenity: "fast_food", brand: "Burger Giant" })));
  await app.seed("history", [{ visit: "v1", placeId: "node/12200", name: "Burger Giant", kind: "", lat: null, lon: null, date: 1, loved: false, ratings: { a: 0, b: 0 }, note: "" }]);
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await expect(page.getByLabel("Skip big chains")).toHaveCount(0);
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Burger Giant");
});

test("nothing fitting, and an empty list, say what to do", async ({ app, page }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant", cuisine: "italian" })));
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await app.refine("Asian").click();
  await app.pick();
  await expect(page.locator("#result")).toContainText("Nothing on your list fits");
  await expect(page.locator("#result")).toContainText("“Any distance”");
  // An empty list stops before picking.
  await openLists(page);
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("Name of the new list").fill("Rainy days");
  await page.getByRole("button", { name: "Create" }).click();
  await openPick(page);
  await page.locator(".list-choice").getByRole("button", { name: "Rainy days" }).click();
  await page.getByRole("button", { name: "Pick for us" }).click();
  await expect(page.locator("#formMsg")).toHaveText("“Rainy days” is empty. Add places to it under Lists first.");
});

test("several lists: pick from the one you choose", async ({ app, page }) => {
  await app.seed("lists", [
    { id: "a", name: "Date night", places: [{ ...saved("Candle Bistro", { amenity: "restaurant" }), moods: ["food"] }] },
    { id: "b", name: "Lunch", places: [{ ...saved("Desk Noodles", { amenity: "fast_food" }), moods: ["food"] }] }
  ]);
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await page.locator(".list-choice").getByRole("button", { name: "Lunch" }).click();
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Desk Noodles");
  await page.locator(".list-choice").getByRole("button", { name: "Date night" }).click();
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Candle Bistro");
});

test("rename, change a place’s moods, remove it, delete the list", async ({ app, page }) => {
  await app.seed("lists", [
    { id: "favorites", name: "Our favorites", places: [] },
    { id: "b", name: "Lunch", places: [{ ...saved("Desk Noodles", { amenity: "fast_food" }), moods: ["food"] }] }
  ]);
  await app.open("#lists");
  await page.locator(".lists-tabs").getByRole("button", { name: /Lunch/ }).click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name for the list").fill("Quick lunch");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#h-list")).toHaveText("Quick lunch");

  await page.locator(".saved-head").click();
  await page.getByRole("group", { name: "Moods for Desk Noodles" }).getByRole("button", { name: "Drinks & coffee" }).click();
  await expect(page.locator(".saved .h-meta")).toContainText("Food, Drinks & coffee");

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Tap again to remove" }).click();
  await expect(page.locator(".list-empty")).toBeVisible();

  await page.getByRole("button", { name: "Delete list" }).click();
  await page.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page.locator(".lists-tabs .chip:not(.new-list)")).toHaveCount(1);
  await expect(page.locator("#h-list")).toHaveText("Our favorites");
});

test("vetoes work when picking from a list", async ({ app, page }) => {
  await app.seed("lists", favorites(saved("One", { amenity: "restaurant" }, 0.001), saved("Two", { amenity: "restaurant" }, 0.003)));
  await app.open();
  await app.setLocation();
  await fromLists(page);
  await app.pick();
  const first = await app.pickedName();
  await page.getByRole("button", { name: /Nope Me/ }).click();
  await expect(page.locator(".t-name")).toHaveText(first === "One" ? "Two" : "One");
});
