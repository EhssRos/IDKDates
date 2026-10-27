// End-to-end: setting a starting point, picking, vetoing and saving a place.
import { test, expect, place } from "./helpers.js";

test.describe("starting point", () => {
  test("first visit shows the pick screen and asks for a starting point", async ({ app, page }) => {
    await app.open();
    await expect(page.getByRole("button", { name: "Pick", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#locStatus")).toHaveText("Not set yet");
    await expect(app.mood("Food")).toHaveAttribute("aria-pressed", "true");
  });

  test("picking without a starting point explains what to do", async ({ app, page }) => {
    await app.open();
    await page.getByRole("button", { name: "Pick for us" }).click();
    await expect(page.locator("#formMsg")).toHaveText("Set where you’re starting from first.");
    await expect(page.getByLabel("Starting point")).toBeFocused();
  });

  test("picking without a mood explains what to do", async ({ app, page }) => {
    await app.open();
    await app.setLocation();
    await app.mood("Food").click();
    await page.getByRole("button", { name: "Pick for us" }).click();
    await expect(page.locator("#formMsg")).toHaveText("Pick at least one mood.");
  });

  test("a typed place is found and remembered after a reload", async ({ app, page }) => {
    await app.open();
    await app.setLocation("Mitte");
    await expect(page.locator("#locStatus")).toHaveText("Mitte, Berlin, Germany");
    await page.reload();
    await expect(page.locator("#locStatus")).toHaveText("Mitte, Berlin, Germany");
  });

  test("an unknown place says so", async ({ app, page, world }) => {
    world.geocode = [];
    await app.open();
    await app.setLocation("Nowhereville");
    await expect(page.locator("#locStatus")).toHaveText("Couldn’t find “Nowhereville”. Try adding the city.");
  });

  test("current location uses GPS and names the neighborhood", async ({ app, page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
    await app.open();
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.locator("#locStatus")).toHaveText("Your location, near Mitte");
  });
});

test.describe("picking", () => {
  test.beforeEach(async ({ app }) => { await app.open(); await app.setLocation(); });

  test("shows one place as a ticket with travel details", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Trattoria Lucia", cuisine: "italian", website: "trattoria.example" }, { north: 0.009 })];
    await app.mode("Foot");
    await app.pick();
    await expect(app.ticket()).toContainText("Italian restaurant");
    await expect(page.locator(".t-name")).toHaveText("Trattoria Lucia");
    await expect(app.ticket()).toContainText("About 16 min on foot");
    await expect(app.ticket()).toContainText("1.0 km away");
    await expect(page.getByRole("link", { name: "Directions" })).toHaveAttribute("href", /destination=52\.529,13\.405&travelmode=walking/);
    await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://trattoria.example");
    await expect(page.locator(".verdict")).toHaveText("Picked from 1 place in reach.");
  });

  test("never picks something out of reach", async ({ app, world }) => {
    world.places = [
      place({ amenity: "restaurant", name: "Near" }, { north: 0.01 }),
      place({ amenity: "restaurant", name: "Too far" }, { north: 0.2 })
    ];
    await app.mode("Bike");
    await app.travel(10);
    expect(await app.pickMany(8)).toEqual(new Set(["Near"]));
  });

  test("the query covers exactly the reach you chose", async ({ app, world }) => {
    world.places = [place({ amenity: "restaurant", name: "A" })];
    await app.mode("Bike");
    await app.travel(20);
    await app.pick();
    expect(world.queries.at(-1)).toContain("(around:3846,52.52,13.405)");
  });

  test("big chains are skipped unless you allow them", async ({ app, page, world }) => {
    world.places = [
      place({ amenity: "fast_food", name: "Burger Giant", brand: "Burger Giant" }),
      place({ amenity: "restaurant", name: "Corner Bistro" })
    ];
    expect(await app.pickMany(6)).toEqual(new Set(["Corner Bistro"]));
    await page.getByLabel("Skip big chains").uncheck();
    expect(await app.pickMany(12)).toEqual(new Set(["Corner Bistro", "Burger Giant"]));
  });

  test("a veto picks something else and is used up", async ({ app, page, world }) => {
    world.places = ["One", "Two", "Three"].map(name => place({ amenity: "restaurant", name }));
    await app.pick();
    const first = await app.pickedName();
    await page.getByRole("button", { name: /Nope Me, 1 left/ }).click();
    await expect(page.locator(".t-name")).not.toHaveText(first);
    await expect(page.getByRole("button", { name: /Nope Me, 0 left/ })).toBeDisabled();
    await page.getByRole("button", { name: /Nope You, 1 left/ }).click();
    await expect(page.locator(".verdict")).toHaveText("No vetoes left. It’s decided.");
  });

  test("turning down every option says so", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Only One" })];
    await app.pick();
    await page.getByRole("button", { name: /Nope Me/ }).click();
    await expect(page.locator("#result")).toContainText("That was the last option");
  });

  test("your names show on the veto buttons, and zero vetoes hides them", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "A" }), place({ amenity: "restaurant", name: "B" })];
    await page.locator("summary", { hasText: "You two" }).click();
    await page.getByLabel("First name").fill("Alex");
    await page.getByLabel("Second name").fill("Sam");
    await app.pick();
    await expect(page.getByRole("button", { name: /Nope Alex, 1 left/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nope Sam, 1 left/ })).toBeVisible();
    await page.getByLabel("Vetoes each per pick").selectOption("0");
    await app.pick();
    await expect(page.getByRole("button", { name: /Nope/ })).toHaveCount(0);
  });

  test("an empty area suggests what to change", async ({ app, page, world }) => {
    world.places = [];
    await app.pick();
    await expect(page.locator("#result")).toContainText("Nothing in reach");
    await expect(page.locator("#result")).toContainText("Try a longer trip");
  });

  test("a busy map server falls back to the next one", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Backup Bistro" })];
    world.mapFailures = 1;
    await app.pick();
    await expect(page.locator(".t-name")).toHaveText("Backup Bistro");
    expect(world.mapEndpoints[0]).not.toBe(world.mapEndpoints[1]);
  });

  test("when every map server fails, you can try again", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Second Try" })];
    world.mapFailures = 3;
    await app.pick();
    await expect(page.locator("#result")).toContainText("The map didn’t answer");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".t-name")).toHaveText("Second Try");
  });

  test("places with a Wikipedia entry get their backstory", async ({ app, page, world }) => {
    world.places = [place({ tourism: "museum", name: "Pergamon", wikidata: "Q154440" })];
    world.wiki.Q154440 = { title: "Pergamon Museum", extract: "A museum on Museum Island in Berlin." };
    await app.onlyMood("Culture");
    await app.pick();
    await expect(page.locator("#tDesc")).toContainText("A museum on Museum Island in Berlin.");
    await expect(page.getByRole("link", { name: "More on Wikipedia" })).toBeVisible();
  });

  test("places without one describe themselves from the map data", async ({ app, page, world }) => {
    world.places = [place({ amenity: "cafe", name: "Kaffeebar", outdoor_seating: "yes" })];
    await app.onlyMood("Drinks & coffee");
    await app.pick();
    await expect(page.locator("#tDesc")).toHaveText("Café with outdoor seating.");
  });

  test("“We’re going” saves the visit and later picks skip it", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Been There" }), place({ amenity: "restaurant", name: "New Place" })];
    await app.pick();
    const went = await app.pickedName();
    await page.getByRole("button", { name: "We’re going" }).click();
    await expect(page.locator(".verdict")).toContainText("Saved to your timeline");
    const other = went === "Been There" ? "New Place" : "Been There";
    expect(await app.pickMany(5)).toEqual(new Set([other]));
    await page.getByLabel("Skip places we’ve already been").uncheck();
    expect(await app.pickMany(12)).toEqual(new Set([went, other]));
  });

  test("settings survive a reload", async ({ app, page }) => {
    await app.mood("Nature").click();
    await app.mode("Car");
    await app.travel(45);
    await page.getByLabel("Skip big chains").uncheck();
    await page.reload();
    await expect(app.mood("Nature")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#modes").getByRole("button", { name: "Car" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#timeOut")).toHaveText("45 min");
    await expect(page.getByLabel("Skip big chains")).not.toBeChecked();
  });

  test("changing settings mid-pick doesn’t mix them into that pick", async ({ app, page, world }) => {
    world.places = q => q.includes("restaurant") ? [place({ amenity: "restaurant", name: "Slow Food Place" })] : [place({ tourism: "museum", name: "Quick Museum" })];
    world.slow = { match: /restaurant/, ms: 1200 };
    await page.getByRole("button", { name: "Pick for us" }).click();
    await expect(page.locator("#result .counting")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pick for us" })).toBeDisabled();
    await app.onlyMood("Culture");
    await app.mode("Car");
    // The running pick finishes with what it was asked: food, by bike.
    await expect(page.locator(".t-name")).toHaveText("Slow Food Place");
    await expect(app.ticket()).toContainText("by bike");
    // The next pick uses the new settings.
    await app.pick();
    await expect(page.locator(".t-name")).toHaveText("Quick Museum");
    await expect(app.ticket()).toContainText("by car");
  });

  test("map results are remembered between visits", async ({ app, page, world }) => {
    world.places = [place({ amenity: "restaurant", name: "Cached Café" })];
    await app.pick();
    expect(world.queries).toHaveLength(1);
    await page.reload();
    await app.pick();
    await expect(page.locator(".t-name")).toHaveText("Cached Café");
    expect(world.queries).toHaveLength(1);
  });
});
