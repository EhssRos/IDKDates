// Shared test setup: fakes every outside service the app talks to,
// pins the clock and makes randomness repeatable, so every run behaves the same.
import { test as base, expect } from "@playwright/test";

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

// Starting point used by most tests: Berlin Mitte.
export const HOME = { lat: 52.52, lon: 13.405, name: "Mitte, Berlin, Germany", cc: "de", state: "Berlin" };

// About 1 km north of HOME per 0.009 degrees of latitude.
let nextId = 1;
/** A place search result as the address search returns it. */
export function searchHit(name, category, type, extratags = {}, { north = 0.002, osmId = Math.floor(Math.random() * 1e8) } = {}) {
  return { osm_type: "node", osm_id: osmId, lat: String(HOME.lat + north), lon: String(HOME.lon), name, display_name: `${name}, Street 1, Mitte, Berlin`, category, type, extratags };
}

export function place(tags, { north = 0.002, east = 0, type = "node" } = {}) {
  const id = nextId++;
  const pos = { lat: HOME.lat + north, lon: HOME.lon + east };
  return type === "node" ? { type, id, ...pos, tags } : { type, id, center: pos, tags };
}

class FakeWorld {
  constructor() {
    this.places = [];          // what the map server returns
    this.queries = [];         // map queries the app sent, decoded
    this.mapFailures = 0;      // how many map requests fail before one answers
    this.mapEndpoints = [];    // which map servers were asked, in order
    this.geocode = [{ lat: String(HOME.lat), lon: String(HOME.lon), display_name: HOME.name, address: { country_code: HOME.cc, state: HOME.state } }];
    this.reverse = { address: { suburb: "Mitte", country_code: HOME.cc, state: HOME.state } };
    this.wiki = {};            // wikidata id -> { title, extract }
    this.blockHoursEngine = false;
    this.slow = null;          // { match: RegExp, ms } to delay matching map queries
    this.hangHosts = [];       // map servers that never answer
    this.placeSearch = [];     // results of searching a place by name (Lists screen)
    this.placeSearches = [];   // what was searched
  }
}

async function installFakes(page, world) {
  await page.route(url => !url.host.startsWith("localhost"), async route => {
    const url = route.request().url();
    if (url.includes("tile.openstreetmap.org")) return route.fulfill({ contentType: "image/png", body: PNG_1PX });
    if (url.includes("nominatim.openstreetmap.org/search")) {
      if (url.includes("extratags=1")) { world.placeSearches.push(new URL(url).searchParams.get("q")); return route.fulfill({ json: world.placeSearch }); }
      return route.fulfill({ json: world.geocode });
    }
    if (url.includes("nominatim.openstreetmap.org/reverse")) return route.fulfill({ json: world.reverse });
    if (url.includes("/api/interpreter")) {
      world.mapEndpoints.push(new URL(url).host);
      if (world.hangHosts.includes(new URL(url).host)) return; // never answer
      const q = decodeURIComponent((route.request().postData() || "").replace(/^data=/, ""));
      world.queries.push(q);
      if (world.slow && world.slow.match.test(q)) await new Promise(r => setTimeout(r, world.slow.ms));
      if (world.mapFailures > 0) { world.mapFailures--; return route.fulfill({ status: 504, body: "busy" }); }
      const elements = typeof world.places === "function" ? world.places(q) : world.places;
      return route.fulfill({ json: { elements } }).catch(() => {});
    }
    if (url.includes("wikidata.org")) {
      const id = new URL(url).searchParams.get("ids");
      const w = world.wiki[id];
      return route.fulfill({ json: { entities: w ? { [id]: { sitelinks: { enwiki: { title: w.title } }, descriptions: {} } } : {} } });
    }
    if (url.includes("wikipedia.org/api/rest_v1/page/summary/")) {
      const title = decodeURIComponent(url.split("/summary/")[1]).replace(/_/g, " ");
      const w = Object.values(world.wiki).find(x => x.title === title);
      return w ? route.fulfill({ json: { extract: w.extract, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + title } } } }) : route.fulfill({ status: 404, json: {} });
    }
    return route.abort();
  });
  // The opening hours engine is a separate file of the app; tests can make it fail to load.
  await page.route(/\/assets\/hoursEngine-[^/]+\.js$/, route => (world.blockHoursEngine ? route.abort() : route.continue()));
}

// A seeded random number generator, so "random" picks are repeatable.
const SEEDED_RANDOM = `(() => { let a = 20261024; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

export const test = base.extend({
  world: async ({}, use) => { await use(new FakeWorld()); },
  // Saturday 24 October 2026, 19:00 in Berlin unless a test sets another time.
  now: [new Date("2026-10-24T19:00:00+02:00"), { option: true }],
  app: async ({ page, world, now }, use) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await installFakes(page, world);
    await page.clock.setFixedTime(now);
    await page.addInitScript(SEEDED_RANDOM);
    await use(new App(page, world));
    expect(errors, "the app threw JavaScript errors").toEqual([]);
  }
});

class App {
  constructor(page, world) { this.page = page; this.world = world; }
  async open(hash = "") {
    await this.page.goto("/" + hash);
    await this.page.waitForFunction(() => document.body.dataset.ready === "1");
  }
  async seed(key, value) {
    // Seed once per tab, so a reload keeps whatever the test changed.
    await this.page.addInitScript(([k, v]) => {
      if (sessionStorage.getItem("seeded:" + k)) return;
      localStorage.setItem("idkdates:v1:" + k, JSON.stringify(v));
      sessionStorage.setItem("seeded:" + k, "1");
    }, [key, value]);
  }
  async setLocation(text = "Mitte") {
    await this.page.getByLabel("Starting point").fill(text);
    await this.page.getByRole("button", { name: "Set", exact: true }).click();
    await expect(this.page.locator("#locStatus")).toHaveClass(/ok|err/);
  }
  mood(name) { return this.page.locator("#vibes").getByRole("button", { name, exact: true }); }
  refine(name) { return this.page.locator("#refine").getByRole("button", { name, exact: true }); }
  async onlyMood(name) {
    const on = this.page.locator("#vibes .chip[aria-pressed=true]");
    while (await on.count()) await on.first().click();
    await this.mood(name).click();
  }
  async mode(name) { await this.page.locator("#modes").getByRole("button", { name }).click(); }
  async travel(minutes) { await this.page.locator("#time").fill(String(minutes)); }
  async pick() {
    await this.page.getByRole("button", { name: "Pick for us" }).click();
    await expect(this.page.locator("#result .ticket, #result .state:not(:has(.counting))")).toBeVisible();
  }
  ticket() { return this.page.locator("#result .ticket"); }
  async pickedName() { return (await this.page.locator(".t-name").textContent()).trim(); }
  async pickMany(n) {
    const names = new Set();
    for (let i = 0; i < n; i++) { await this.pick(); if (await this.ticket().count()) names.add(await this.pickedName()); }
    return names;
  }
}

export { expect };
