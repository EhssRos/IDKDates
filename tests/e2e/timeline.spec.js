// End-to-end: the timeline of places you went, with ratings, notes and a map.
import { test, expect, place, HOME } from "./helpers.js";

const visit = (over = {}) => ({
  visit: "v" + Math.random().toString(36).slice(2), placeId: "node/" + Math.floor(Math.random() * 1e6),
  name: "Somewhere", kind: "Restaurant", vibe: "food", lat: HOME.lat, lon: HOME.lon,
  date: Date.parse("2026-10-17T20:00:00+02:00"), loved: false, ratings: { a: 0, b: 0 }, note: "", ...over
});
const openTimeline = page => page.getByRole("button", { name: "Timeline", exact: true }).click();
const entry = (page, name) => page.locator(".tl-item", { has: page.locator(".tl-name", { hasText: name }) });

test("starts empty with a hint", async ({ app, page }) => {
  await app.open();
  await openTimeline(page);
  await expect(page.locator(".tl-empty")).toContainText("Nothing here yet");
  await expect(page.locator("#tlMap")).toBeHidden();
});

test("a place you go to shows up on the timeline", async ({ app, page, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Trattoria Lucia", cuisine: "italian" })];
  await app.open();
  await app.setLocation();
  await app.pick();
  await page.getByRole("button", { name: "We’re going" }).click();
  await openTimeline(page);
  await expect(page).toHaveURL(/#timeline$/);
  await expect(page.locator(".tl-month")).toHaveText("October 2026");
  await expect(entry(page, "Trattoria Lucia")).toContainText("Sat, Oct 24");
  await expect(entry(page, "Trattoria Lucia")).toContainText("Italian restaurant");
  await expect(page.locator("#tlSum")).toHaveText("1 outing together since October 2026.");
});

test("going to the same place twice makes two entries", async ({ app, page, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Regular Spot" })];
  await app.open();
  await app.setLocation();
  await page.getByLabel("Skip places we’ve already been").uncheck();
  for (let i = 0; i < 2; i++) { await app.pick(); await page.getByRole("button", { name: "We’re going" }).click(); }
  await openTimeline(page);
  await expect(entry(page, "Regular Spot")).toHaveCount(2);
});

test("entries are grouped by month, newest first", async ({ app, page }) => {
  await app.seed("history", [
    visit({ name: "September Thing", date: Date.parse("2026-09-05T20:00:00+02:00") }),
    visit({ name: "October Thing", date: Date.parse("2026-10-10T20:00:00+02:00") }),
    visit({ name: "Last Night", date: Date.parse("2026-10-23T20:00:00+02:00") })
  ]);
  await app.open("#timeline");
  await expect(page.locator(".tl-month")).toHaveText(["October 2026", "September 2026"]);
  await expect(page.locator(".tl-name")).toHaveText(["Last Night", "October Thing", "September Thing"]);
});

test("you both rate a place and the average shows", async ({ app, page }) => {
  await app.seed("history", [visit({ name: "Ramen Bar" })]);
  await app.seed("settings", { nameA: "Alex", nameB: "Sam" });
  await app.open("#timeline");
  const e = entry(page, "Ramen Bar");
  await expect(e).toContainText("Rate it");
  await e.locator(".tl-head").click();
  await e.getByRole("group", { name: "Alex’s rating" }).getByRole("button", { name: "4 of 5" }).click();
  await e.getByRole("group", { name: "Sam’s rating" }).getByRole("button", { name: "5 of 5" }).click();
  await expect(e.locator(".tl-score")).toContainText("4.5");
  await expect(page.locator("#tlSum")).toContainText("Average rating 4.5. Favorite so far: Ramen Bar.");
  // Tapping the same rating again clears it.
  await e.getByRole("group", { name: "Sam’s rating" }).getByRole("button", { name: "5 of 5" }).click();
  await expect(e.locator(".tl-score")).toContainText("4.0");
  await page.reload();
  await expect(entry(page, "Ramen Bar").locator(".tl-score")).toContainText("4.0");
});

test("notes are saved and previewed", async ({ app, page }) => {
  await app.seed("history", [visit({ name: "Night Market" })]);
  await app.open("#timeline");
  const e = entry(page, "Night Market");
  await e.locator(".tl-head").click();
  await e.getByLabel("What do you want to remember?").fill("The dumplings. Go back for the dumplings.");
  await e.locator(".tl-head").click();
  await expect(e.locator(".tl-note-preview")).toHaveText("“The dumplings. Go back for the dumplings.”");
  await page.reload();
  await expect(entry(page, "Night Market").locator(".tl-note-preview")).toContainText("dumplings");
});

test("loved places stand out and can be filtered", async ({ app, page }) => {
  await app.seed("history", [visit({ name: "Keeper" }), visit({ name: "Meh" })]);
  await app.open("#timeline");
  const e = entry(page, "Keeper");
  await e.locator(".tl-head").click();
  await e.getByRole("button", { name: "Love it" }).click();
  await expect(e).toHaveClass(/loved/);
  await page.locator("#tlFilter").getByRole("button", { name: "Loved" }).click();
  await expect(page.locator(".tl-name")).toHaveText(["Keeper"]);
});

test("filter by rating", async ({ app, page }) => {
  await app.seed("history", [
    visit({ name: "Great", ratings: { a: 5, b: 4 } }),
    visit({ name: "Okay", ratings: { a: 3, b: 3 } }),
    visit({ name: "Unrated" })
  ]);
  await app.open("#timeline");
  const filter = name => page.locator("#tlFilter").getByRole("button", { name }).click();
  await filter("Rated 4+");
  await expect(page.locator(".tl-name")).toHaveText(["Great"]);
  await filter("Not rated yet");
  await expect(page.locator(".tl-name")).toHaveText(["Unrated"]);
  await filter("All");
  await expect(page.locator(".tl-name")).toHaveCount(3);
});

test("removing takes two taps", async ({ app, page }) => {
  await app.seed("history", [visit({ name: "Mistake" }), visit({ name: "Keep Me" })]);
  await app.open("#timeline");
  const e = entry(page, "Mistake");
  await e.locator(".tl-head").click();
  await e.getByRole("button", { name: "Remove" }).click();
  await expect(e.getByRole("button", { name: "Tap again to remove" })).toBeVisible();
  await e.getByRole("button", { name: "Tap again to remove" }).click();
  await expect(page.locator(".tl-name")).toHaveText(["Keep Me"]);
});

test("the map shows where you went and opens an entry from its pin", async ({ app, page }) => {
  await app.seed("history", [
    visit({ name: "North", lat: HOME.lat + 0.01 }),
    visit({ name: "South", lat: HOME.lat - 0.01, loved: true }),
    visit({ name: "No Coordinates", lat: null, lon: null })
  ]);
  await app.open("#timeline");
  await expect(page.locator("#tlMap")).toBeVisible();
  await expect(page.locator(".tl-pin")).toHaveCount(2);
  await expect(page.locator(".tl-pin.loved")).toHaveCount(1);
  await page.locator(".leaflet-marker-icon[title='North']").click();
  await expect(entry(page, "North").locator(".tl-head")).toHaveAttribute("aria-expanded", "true");
});

test("visits saved by older versions still work", async ({ app, page }) => {
  await app.seed("history", [{ id: "node/42", name: "Old Favorite", kind: "Café", date: Date.parse("2026-08-01T12:00:00+02:00"), loved: true }]);
  await app.open("#timeline");
  const e = entry(page, "Old Favorite");
  await expect(e).toHaveClass(/loved/);
  await e.locator(".tl-head").click();
  await e.getByRole("group", { name: "Me’s rating" }).getByRole("button", { name: "3 of 5" }).click();
  await expect(e.locator(".tl-score")).toContainText("3.0");
  await expect(page.locator("#tlMap")).toBeHidden();
});

test("switching between Pick and Timeline", async ({ app, page }) => {
  await app.open();
  await openTimeline(page);
  await expect(page.locator("#viewPick")).toBeHidden();
  await expect(page.getByRole("button", { name: "Timeline", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pick", exact: true }).click();
  await expect(page.locator("#viewTimeline")).toBeHidden();
  await expect(page).toHaveURL(/#pick$/);
});

test("data saved under the app’s old name carries over", async ({ app, page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("old-seeded")) return;
    localStorage.setItem("eeny:v1:history", JSON.stringify([{ id: "node/7", name: "From Before", kind: "Bar", date: Date.parse("2026-10-01T21:00:00+02:00") }]));
    localStorage.setItem("eeny:v1:settings", JSON.stringify({ nameA: "Alex" }));
    sessionStorage.setItem("old-seeded", "1");
  });
  await app.open("#timeline");
  await expect(page.locator(".tl-name")).toHaveText(["From Before"]);
  await page.locator(".tl-head").click();
  await expect(page.getByRole("group", { name: "Alex’s rating" })).toBeVisible();
});
