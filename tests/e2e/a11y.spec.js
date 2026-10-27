// Accessibility: automated checks (axe) in light and dark mode, plus keyboard use.
import { test, expect, place } from "./helpers.js";
import AxeBuilder from "@axe-core/playwright";

const scan = async page => {
  const { violations } = await new AxeBuilder({ page }).exclude("#tlMap").analyze();
  return violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`);
};

for (const scheme of ["light", "dark"]) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("pick screen with a ticket has no accessibility problems", async ({ app, page, world }) => {
      world.places = [place({ amenity: "restaurant", name: "Trattoria Lucia", cuisine: "italian", opening_hours: "Mo-Su 12:00-23:00" })];
      await app.open();
      await app.setLocation();
      await app.mood("Clubs").click();
      await app.onlyMood("Food");
      await app.pick();
      expect(await scan(page)).toEqual([]);
    });

    test("timeline with an open entry has no accessibility problems", async ({ app, page }) => {
      await app.seed("history", [{ visit: "v1", placeId: "node/1", name: "Ramen Bar", kind: "Restaurant", lat: 52.52, lon: 13.405, date: Date.parse("2026-10-17T20:00:00+02:00"), loved: true, ratings: { a: 4, b: 0 }, note: "Good broth" }]);
      await app.open("#timeline");
      await page.locator(".tl-head").click();
      expect(await scan(page)).toEqual([]);
    });
  });
}

test("the whole flow works with the keyboard", async ({ app, page, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Keyboard Kitchen" })];
  await app.open();
  await page.getByLabel("Starting point").focus();
  await page.keyboard.type("Mitte");
  await page.keyboard.press("Enter");
  await expect(page.locator("#locStatus")).toHaveText("Mitte, Berlin, Germany");
  await page.getByRole("button", { name: "Pick for us" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".t-name")).toHaveText("Keyboard Kitchen");
  await page.getByRole("button", { name: "We’re going" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".verdict")).toContainText("Saved");
});
