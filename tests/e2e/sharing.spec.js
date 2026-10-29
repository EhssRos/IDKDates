// End-to-end: signing in and sharing lists and the timeline between two phones.
import { test, expect, place, searchHit, HOME } from "./helpers.js";

const saved = (name, tags, north = 0.002) => ({ id: "node/" + name.replace(/\W/g, ""), name, lat: HOME.lat + north, lon: HOME.lon, tags: { name, ...tags }, moods: ["food"], added: 1 });
const favorites = (...places) => [{ id: "favorites", name: "Our favorites", places }];
const visit = (id, name, over = {}) => ({ visit: id, placeId: "node/" + name, name, kind: "Restaurant", mood: "food", lat: HOME.lat, lon: HOME.lon,
  date: Date.parse("2026-10-17T20:00:00+02:00"), loved: false, ratings: { a: 0, b: 0 }, note: "", ...over });
const tab = (app, name) => app.page.locator("#views").getByRole("button", { name, exact: true }).click();
const listNames = app => app.page.locator(".saved .h-name");

test("signing in keeps what’s already on the phone", async ({ app, page, world }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant" })));
  await app.open();
  await expect(page.locator(".account-btn")).toHaveText("Share");
  await app.signIn("alex@example.com", "Alex");
  expect(world.supabase.codesSent).toEqual(["alex@example.com"]);
  await expect(page.locator(".account-btn")).toContainText("Account");
  await expect(page.locator("#inviteLink")).toContainText("#join=");
  expect([...world.supabase.items.values()].map(r => r.kind).sort()).toEqual(["list", "place"]);
  await page.reload();
  await expect(page.locator(".account-btn")).toContainText("Account");
});

test("a wrong code says so", async ({ app, page }) => {
  await app.open("#account");
  await page.getByLabel("Your email").fill("alex@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByLabel("Code from the email").fill("999999");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#viewAccount .form-msg")).toHaveText("That code didn’t work. Check it, or send a new one.");
});

test("the partner opens the invite link, signs in, and both phones share everything", async ({ app, partner, page }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant" })));
  await app.seed("history", [visit("v1", "Nonna")]);
  await partner.seed("lists", favorites(saved("Thai Corner", { amenity: "restaurant", cuisine: "thai" })));
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  const link = await page.locator("#inviteLink").textContent();

  await partner.page.goto(new URL(link).pathname + new URL(link).hash);
  await expect(partner.page.locator("#viewAccount")).toContainText("You’ve been invited");
  await partner.signIn("sam@example.com", "Sam");
  await expect(partner.page.locator("#h-account")).toHaveText("Shared with Alex");

  await tab(partner, "Lists");
  await expect(listNames(partner)).toHaveCount(2);
  expect((await listNames(partner).allTextContents()).sort()).toEqual(["Nonna", "Thai Corner"]);
  await tab(partner, "Timeline");
  await expect(partner.page.locator(".tl-name")).toHaveText(["Nonna"]);

  await app.syncNow();
  await expect(page.locator("#h-account")).toHaveText("Shared with Sam");
  await expect(page.locator(".account-btn")).toContainText("Shared");
  await tab(app, "Lists");
  await expect(listNames(app)).toHaveCount(2);
  expect((await listNames(app).allTextContents()).sort()).toEqual(["Nonna", "Thai Corner"]);
});

test("each person rates on their own phone and sees the other’s rating", async ({ app, partner, page }) => {
  await app.seed("history", [visit("v1", "Ramen Bar")]);
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  const code = (await page.locator("#inviteCode").textContent()).trim();
  await partner.open("#join=" + code);
  await partner.signIn("sam@example.com", "Sam");

  await tab(app, "Timeline");
  await page.locator(".tl-head").click();
  await page.getByRole("group", { name: "Alex’s rating" }).getByRole("button", { name: "4 of 5" }).click();
  await app.syncNow();

  await partner.syncNow();
  await tab(partner, "Timeline");
  await partner.page.locator(".tl-head").click();
  const alexOnSam = partner.page.getByRole("group", { name: "Alex’s rating" });
  await expect(alexOnSam.getByRole("button", { name: "4 of 5" })).toHaveAttribute("aria-pressed", "true");
  await expect(alexOnSam.getByRole("button", { name: "1 of 5" })).toBeDisabled();
  await partner.page.getByRole("group", { name: "Sam’s rating" }).getByRole("button", { name: "5 of 5" }).click();
  await partner.syncNow();

  await app.syncNow();
  await tab(app, "Timeline");
  await expect(page.locator(".tl-score")).toContainText("4.5");
});

test("a place added on one phone shows up on the other", async ({ app, partner, page, world }) => {
  world.placeSearch = [searchHit("Desk Noodles", "amenity", "fast_food", { cuisine: "noodle" })];
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  const code = (await page.locator("#inviteCode").textContent()).trim();
  await partner.open("#join=" + code);
  await partner.signIn("sam@example.com", "Sam");

  await tab(partner, "Lists");
  await partner.page.getByLabel("Search for a place to add").fill("Desk Noodles");
  await partner.page.getByRole("button", { name: "Search", exact: true }).click();
  await partner.page.getByRole("button", { name: "Add Desk Noodles" }).click();
  await partner.syncNow();

  await app.syncNow();
  await tab(app, "Lists");
  await expect(listNames(app)).toHaveText(["Desk Noodles"]);
});

test("offline: keeps working, says so, and catches up", async ({ app, page, world }) => {
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  world.supabase.offline = true;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.locator("#syncStatus")).toContainText("Offline. Changes are saved here and sync when you’re back.");
  world.supabase.offline = false;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.locator("#syncStatus")).toContainText("Synced");
});

test("stopping sharing keeps everything on the phone", async ({ app, partner, page }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant" })));
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  const code = (await page.locator("#inviteCode").textContent()).trim();
  await partner.open("#join=" + code);
  await partner.signIn("sam@example.com", "Sam");
  await partner.page.getByRole("button", { name: "Stop sharing" }).click();
  await partner.page.getByRole("button", { name: "Tap again to stop sharing" }).click();
  await expect(partner.page.locator("#viewAccount .form-msg")).toContainText("You’ve stopped sharing");
  await expect(partner.page.locator("#h-account")).toHaveText("Share with your partner");
  await tab(partner, "Lists");
  await expect(listNames(partner)).toHaveText(["Nonna"]);
});

test("signing out and deleting the account keep everything on the phone", async ({ app, page, world }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant" })));
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator(".account-btn")).toHaveText("Share");
  await app.signIn("alex@example.com");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Tap again to delete your account" }).click();
  await expect(page.locator(".account-btn")).toHaveText("Share");
  expect(world.supabase.users.size).toBe(0);
  expect(world.supabase.spaces.size).toBe(0);
  await tab(app, "Lists");
  await expect(listNames(app)).toHaveText(["Nonna"]);
});

test("changes sync by themselves a moment later", async ({ app, page, world }) => {
  world.placeSearch = [searchHit("Corner Café", "amenity", "cafe")];
  await app.open();
  await app.signIn("alex@example.com", "Alex");
  await tab(app, "Lists");
  await page.getByLabel("Search for a place to add").fill("Corner Café");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Add Corner Café" }).click();
  await expect.poll(() => [...world.supabase.items.values()].some(r => r.kind === "place" && r.data.name === "Corner Café"), { timeout: 5000 }).toBe(true);
});

test("signing in with the link from the email, and inviting the partner the same way", async ({ app, partner, page, world }) => {
  await app.seed("lists", favorites(saved("Nonna", { amenity: "restaurant" })));
  await app.open();
  await app.signInWithLink("alex@example.com", "Alex");
  await expect(page).toHaveURL(/#account$/);
  expect(world.supabase.lastRedirect).toBe("http://localhost:4173/");
  const link = await page.locator("#inviteLink").textContent();

  await partner.page.goto(new URL(link).pathname + new URL(link).hash);
  await partner.signInWithLink("sam@example.com", "Sam");
  await expect(partner.page.locator("#h-account")).toHaveText("Shared with Alex");
  await tab(partner, "Lists");
  await expect(listNames(partner)).toHaveText(["Nonna"]);
});

test("an old sign-in link says what to do", async ({ app, page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.locator("#viewAccount .form-msg")).toHaveText("That sign-in link has expired or was already used. Send yourself a new one.");
  await expect(page).toHaveURL(/#account$/);
  void app;
});

test("the link also works when it opens in a tab where the app is already open", async ({ app, page, world }) => {
  await app.open("#account");
  await page.getByLabel("Your email").fill("alex@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(world.supabase.signInLink("alex@example.com"));
  await expect(page.locator("#syncStatus")).toContainText("Synced");
  await expect(page).toHaveURL(/#account$/);
});
