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

test("nature includes lakes, but not the pond in someone’s garden", async ({ app, page, world }) => {
  world.places = [
    place({ natural: "water", name: "Schlachtensee" }, { type: "relation", size: 1500 }),
    place({ natural: "water", water: "lake", name: "Garden Pond" }, { type: "way", size: 15 })
  ];
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

test("nature leaves out pocket parks and tiny ponds, and says so", async ({ app, page, world }) => {
  world.places = [
    place({ leisure: "park", name: "Pocket Park" }, { type: "way", size: 40 }),
    place({ natural: "water", name: "Backyard Pond" }, { type: "way", size: 12 })
  ];
  await app.onlyMood("Nature");
  await app.pick();
  await expect(page.locator(".why-list li")).toHaveText(["2 are too small or minor for an outing"]);
});

test("nature finds big parks, forests and botanical gardens", async ({ app, world }) => {
  world.places = [
    place({ leisure: "park", name: "Volkspark" }, { type: "way", size: 400 }),
    place({ landuse: "forest", name: "Stadtwald" }, { type: "relation", size: 2000 }),
    place({ leisure: "garden", "garden:type": "botanical", name: "Botanic Garden" }, { type: "way", size: 120 })
  ];
  await app.onlyMood("Nature");
  expect(await app.pickMany(14)).toEqual(new Set(["Volkspark", "Stadtwald", "Botanic Garden"]));
});

test("history finds castles and notable memorials, not Stolpersteine", async ({ app, world, page }) => {
  world.places = [
    place({ historic: "memorial", memorial: "stolperstein", name: "Stolperstein für A. B." }),
    place({ historic: "memorial", memorial: "plaque", name: "Plaque" }),
    place({ historic: "castle", name: "Old Castle" }, { type: "way", size: 120 }),
    place({ historic: "memorial", memorial: "statue", wikidata: "Q42", name: "Famous Memorial" })
  ];
  await app.onlyMood("Culture");
  await app.refine("History").click();
  expect(await app.pickMany(24)).toEqual(new Set(["Old Castle", "Famous Memorial"]));
  const q = world.queries.at(-1);
  expect(q).toContain('nwr["historic"~"^(castle|palace|fort|manor|monastery|ruins|archaeological_site|city_gate|citywalls|castle_wall|tower|battlefield|aqueduct|monument)$"]');
  expect(q).toContain('["wikidata"]');
});

test("nature reserves: big ones are measured to their nearest edge, protection zones are left out", async ({ app, page, world }) => {
  // About 6 km across, its middle 4 km away, its southern edge 1 km away.
  const reserve = place({ leisure: "nature_reserve", boundary: "protected_area", protect_class: "4", name: "Tegeler Fließ" }, { type: "relation", north: 0.036, size: 6000 });
  world.places = [reserve, place({ boundary: "protected_area", protect_class: "12", name: "Water Protection Zone III" }, { type: "relation", size: 3000 })];
  await app.onlyMood("Nature");
  await app.refine("Nature reserves").click();
  await app.mode("Foot");
  await app.travel(25);
  expect(await app.pickMany(4)).toEqual(new Set(["Tegeler Fließ"]));
  await expect(app.ticket()).toContainText("Nature reserve");
  await expect(app.ticket()).toContainText("To the edge");
  const href = await page.getByRole("link", { name: "Directions" }).getAttribute("href");
  const lat = Number(new URL(href).searchParams.get("destination").split(",")[0]);
  expect(lat).toBeCloseTo(reserve.bounds.minlat, 5);
});
