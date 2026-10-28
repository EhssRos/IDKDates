// End-to-end: opening hours are judged at the time you would arrive.
import { test, expect, place } from "./helpers.js";

// Saturday 24 October 2026, 19:00 in Berlin (set in helpers).
test.beforeEach(async ({ app }) => { await app.open(); await app.setLocation(); });

test("closed places are skipped, unknown ones are kept and flagged", async ({ app, page, world }) => {
  world.places = [
    place({ amenity: "restaurant", name: "Lunch Only", opening_hours: "Mo-Su 11:00-15:00" }),
    place({ amenity: "restaurant", name: "Mystery Diner" })
  ];
  expect(await app.pickMany(5)).toEqual(new Set(["Mystery Diner"]));
  await expect(app.ticket()).toContainText("Hours unknown. Check before you go.");
});

test("open places show until when", async ({ app, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Dinner Spot", opening_hours: "Mo-Su 17:00-22:00" })];
  await app.pick();
  await expect(app.ticket()).toContainText(/Open when you get there, until (22:00|10:00 PM)/);
});

test("places about to close are skipped", async ({ app, page, world }) => {
  world.places = [place({ amenity: "cafe", name: "Closing Soon", opening_hours: "Mo-Su 08:00-19:30" })];
  await app.onlyMood("Drinks & coffee");
  await app.pick();
  await expect(page.locator("#result")).toContainText("Nothing fits right now");
  await expect(page.locator(".why-list li")).toHaveText(["1 is closed or closing soon when you’d arrive"]);
});

test("hours are checked for when you arrive, not for now", async ({ app, page, world }) => {
  // About 20 minutes away on foot; opens at 19:15.
  world.places = [place({ amenity: "restaurant", name: "Opens Soon", opening_hours: "Mo-Su 19:15-23:00" }, { north: 0.0111 })];
  await app.mode("Foot");
  await app.travel(25);
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Opens Soon");
  // Very close by car (arrive about 19:05): still closed then.
  world.places = [place({ amenity: "restaurant", name: "Opens Soon Nearby", opening_hours: "Mo-Su 19:15-23:00" })];
  await app.mode("Car");
  await app.pick();
  await expect(page.locator(".why-list li")).toHaveText(["1 is closed or closing soon when you’d arrive"]);
});

test("you can switch the check off", async ({ app, page, world }) => {
  world.places = [place({ amenity: "restaurant", name: "Lunch Only", opening_hours: "Mo-Su 11:00-15:00" })];
  await page.getByLabel("Skip places that are closed when we’d arrive").uncheck();
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Lunch Only");
});

test("if the hours library can’t load, everything still works with hours unknown", async ({ page, world, app }) => {
  world.blockHoursEngine = true;
  await page.reload();
  world.places = [place({ amenity: "restaurant", name: "Lunch Only", opening_hours: "Mo-Su 11:00-15:00" })];
  await app.pick();
  await expect(page.locator(".t-name")).toHaveText("Lunch Only");
  await expect(app.ticket()).toContainText("Hours unknown");
});

test.describe("late at night", () => {
  test.use({ now: new Date("2026-10-24T23:30:00+02:00") });
  test("clubs open past midnight count as open", async ({ app, world }) => {
    world.places = [place({ amenity: "nightclub", name: "Night Owl", opening_hours: "Fr,Sa 23:00-06:00" })];
    await app.onlyMood("Clubs");
    await app.pick();
    await expect(app.ticket()).toContainText(/until (06:00|6:00 AM)/);
  });
});

test.describe("late in the evening", () => {
  test.use({ now: new Date("2026-10-27T22:40:00+01:00") });

  test("when everything nearby is closing, it says so and one tap includes closed places", async ({ app, page, world }) => {
    world.places = [
      place({ amenity: "restaurant", name: "Early Closer", opening_hours: "Mo-Su 12:00-22:00" }),
      place({ amenity: "restaurant", name: "Last Orders", opening_hours: "Mo-Su 12:00-23:00" })
    ];
    await app.pick();
    await expect(page.locator("#result")).toContainText("We found 2 places for that mood nearby, but:");
    await expect(page.locator(".why-list li")).toHaveText(["2 are closed or closing soon when you’d arrive"]);
    await page.getByRole("button", { name: "Include closed places" }).click();
    await expect(page.locator(".t-name")).toHaveText(/Early Closer|Last Orders/);
    await expect(page.getByLabel("Skip places that are closed when we’d arrive")).not.toBeChecked();
  });
});
