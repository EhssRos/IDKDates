// End-to-end: moods and the "anything specific?" filters.
import { test, expect, place } from "./helpers.js";

test.beforeEach(async ({ app }) => { await app.open(); await app.setLocation(); });

test("each selected mood asks its own follow-up question", async ({ app, page }) => {
  await expect(page.locator(".refine")).toHaveCount(1);
  await expect(page.locator(".refine-q")).toHaveText("Food. Craving anything?");
  await app.mood("Clubs").click();
  await expect(page.locator(".refine-q")).toHaveText(["Food. Craving anything?", "Clubs. What kind of night?"]);
  await app.mood("Food").click();
  await expect(page.locator(".refine-q")).toHaveText(["Clubs. What kind of night?"]);
});

test("“Anything” is on until you choose something, and resets it", async ({ app }) => {
  await expect(app.refine("Anything")).toHaveAttribute("aria-pressed", "true");
  await app.refine("Asian").click();
  await app.refine("Pizza").click();
  await expect(app.refine("Anything")).toHaveAttribute("aria-pressed", "false");
  await expect(app.refine("Asian")).toHaveAttribute("aria-pressed", "true");
  await app.refine("Anything").click();
  await expect(app.refine("Asian")).toHaveAttribute("aria-pressed", "false");
  await expect(app.refine("Pizza")).toHaveAttribute("aria-pressed", "false");
});

test("a filter narrows the map query itself", async ({ app, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Thai Garden", cuisine: "thai" })];
  await app.refine("Asian").click();
  await app.pick();
  const q = world.queries.at(-1);
  expect(q).toMatch(/\["cuisine"~"\(\^\|;\) \*\([^)]*thai[^)]*\) \*\(;\|\$\)",i\]/);
  expect(q).not.toContain("ice_cream)$");
});

const menu = () => [
  place({ amenity: "restaurant", name: "Thai Garden", cuisine: "thai" }),
  place({ amenity: "restaurant", name: "Green Wok", cuisine: "chinese", "diet:vegan": "yes" }),
  place({ amenity: "restaurant", name: "Nonna", cuisine: "italian" }),
  place({ amenity: "fast_food", name: "Pizza Slice", cuisine: "pizza" })
];

test("two of the same kind widen the choice", async ({ app, world }) => {
  world.places = menu();
  await app.refine("Asian").click();
  await app.refine("Italian").click();
  expect(await app.pickMany(14)).toEqual(new Set(["Thai Garden", "Green Wok", "Nonna"]));
});

test("different kinds narrow it down", async ({ app, world }) => {
  world.places = menu();
  await app.refine("Asian").click();
  await app.refine("Veggie & vegan").click();
  expect(await app.pickMany(4)).toEqual(new Set(["Green Wok"]));
});

test("filters for other moods work the same way", async ({ app, world }) => {
  world.places = [
    place({ amenity: "bar", name: "Sunny Bar", outdoor_seating: "yes" }),
    place({ amenity: "bar", name: "Cellar Bar" }),
    place({ amenity: "cafe", name: "Terrace Café", outdoor_seating: "yes" })
  ];
  await app.onlyMood("Drinks & coffee");
  await app.refine("Bars").click();
  await app.refine("Sit outside").click();
  expect(await app.pickMany(4)).toEqual(new Set(["Sunny Bar"]));
});

test("clubs come from nightclubs and live music venues", async ({ app, page, world }) => {
  world.places = [place({ amenity: "nightclub", name: "Basement" })];
  await app.onlyMood("Clubs");
  await app.pick();
  await expect(app.ticket()).toContainText("Club");
  expect(world.queries.at(-1)).toContain('["amenity"~"^(nightclub|music_venue)$"]');
});

test("nature includes lakes", async ({ app, page, world }) => {
  world.places = [place({ natural: "water", water: "lake", name: "Schlachtensee" }, { type: "way" })];
  await app.onlyMood("Nature");
  await app.refine("By the water").click();
  await app.pick();
  await expect(app.ticket()).toContainText("Lake");
  await expect(page.locator(".t-name")).toHaveText("Schlachtensee");
});

test("too many filters explain how to loosen them", async ({ app, page, world }) => {
  world.places = menu();
  await app.refine("Mexican & Latin").click();
  await app.pick();
  await expect(page.locator(".why-list li")).toHaveText(["4 don’t match your filters"]);
  await page.getByRole("button", { name: "Clear the filters" }).click();
  await expect(page.locator(".t-name")).toBeVisible();
  await expect(app.refine("Anything")).toHaveAttribute("aria-pressed", "true");
});

test("filters are remembered", async ({ app, page }) => {
  await app.refine("Burgers").click();
  await page.reload();
  await expect(app.refine("Burgers")).toHaveAttribute("aria-pressed", "true");
});
