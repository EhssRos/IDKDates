import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../../src/core/storage";
import { boxAround, buildQuery, fetchPlaces, MapUnavailableError, OVERPASS_ENDPOINTS, parseElements, runQuery } from "../../src/data/overpass";
import { PlaceCache } from "../../src/data/placeCache";

afterEach(() => vi.unstubAllGlobals());
const at = { lat: 52.52, lon: 13.405 };
const answer = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 });
const names = (r: { places: { name: string }[] }) => r.places.map(p => p.name);
const fast = { hedgeAfterMs: 30, perServerMs: 400, deadlineMs: 800 };
const noFallback = { fallback: false, timing: fast };
const hang = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) =>
  init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
const isOverpass = (url: string) => url.includes("/interpreter");

describe("map query", () => {
  it("narrows by area first and keeps the server’s work small", () => {
    const q = buildQuery("food", {}, at, 1000);
    const b = boxAround(at, 1000);
    expect(q).toContain(`[bbox:${b.s},${b.w},${b.n},${b.e}]`);
    expect(q).toContain('nw["amenity"~"^(restaurant|fast_food|ice_cream|food_court)$"]["name"](around:1000,52.52,13.405);');
    expect(q).not.toContain("nwr");
    expect(q).toContain("out tags bb 500;");
    // Big parks, lakes, forests and castles are often relations.
    expect(buildQuery("nature", {}, at, 1000)).toContain('nwr["leisure"="park"]["name"]');
    expect(q).not.toContain("access");
    expect(b.n - b.s).toBeCloseTo(2000 / 111320, 4);
  });

  it("turns map elements into places, skipping unnamed, duplicate and private ones", () => {
    const places = parseElements([
      { type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } },
      { type: "way", id: 2, center: { lat: 3, lon: 4 }, tags: { name: "B" } },
      { type: "node", id: 3, lat: 1, lon: 2, tags: {} },
      { type: "node", id: 4, lat: 1, lon: 2, tags: { name: "A" } },
      { type: "node", id: 5, lat: 1, lon: 2, tags: { name: "Members Club", access: "private" } }
    ], "food");
    expect(places).toEqual([
      { id: "node/1", name: "A", lat: 1, lon: 2, tags: { name: "A" }, mood: "food" },
      { id: "way/2", name: "B", lat: 3, lon: 4, tags: { name: "B" }, mood: "food" }
    ]);
  });
});

describe("map servers", () => {
  it("fall back to the next server when one is busy", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? new Response("busy", { status: 504 }) : answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } }]);
    }));
    expect(await fetchPlaces("food", {}, at, 1000, noFallback)).toEqual({ places: [expect.objectContaining({ name: "A" })], via: "map" });
    expect(calls).toEqual(OVERPASS_ENDPOINTS.slice(0, 2));
  });

  it("ask the next server when the first is slow, and use whichever answers first", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      calls.push(url);
      return url === OVERPASS_ENDPOINTS[0] ? hang(url, init) : Promise.resolve(answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Second" } }]));
    }));
    const started = Date.now();
    expect(names(await fetchPlaces("food", {}, at, 1000, noFallback))).toEqual(["Second"]);
    expect(calls).toEqual(OVERPASS_ENDPOINTS.slice(0, 2));
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("treat an overloaded server’s “timed out” answer as a failure, not as an empty area", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++n === 1
      ? new Response(JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 21 seconds." }))
      : answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Real" } }])));
    expect(names(await fetchPlaces("food", {}, at, 1000, noFallback))).toEqual(["Real"]);
  });

  it("give up in time and say what each server did", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) =>
      url === OVERPASS_ENDPOINTS[0] ? new Response("", { status: 429 }) : hang(url, init)));
    const err = await runQuery("q", { timing: { ...fast, perServerMs: 5000 } }).catch(e => e);
    expect(err).toBeInstanceOf(MapUnavailableError);
    expect(err.reasons[0]).toBe("overpass-api.de: too many requests (429)");
    expect(err.reasons.at(-1)).toMatch(/gave up after/);
  });

  it("stop at once when cancelled", async () => {
    const fetchMock = vi.fn(hang);
    vi.stubGlobal("fetch", fetchMock);
    const ctl = new AbortController();
    const p = fetchPlaces("food", {}, at, 1000, { signal: ctl.signal, ...noFallback });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuse fresh results instead of asking again, and never cache a failure", async () => {
    let fail = true;
    const fetchMock = vi.fn(async () => (fail ? new Response("", { status: 504 }) : answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } }])));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new PlaceCache(memoryStore());
    await expect(fetchPlaces("food", {}, at, 1000, { cache, ...noFallback })).rejects.toBeInstanceOf(MapUnavailableError);
    fail = false;
    await fetchPlaces("food", {}, at, 1000, { cache, ...noFallback });
    const calls = fetchMock.mock.calls.length;
    await fetchPlaces("food", {}, at, 1000, { cache, ...noFallback });
    expect(fetchMock.mock.calls.length).toBe(calls);
    await fetchPlaces("food", { food: ["pizza"] }, at, 1000, { cache, ...noFallback });
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });
});

describe("when every map server is down", () => {
  const nominatimRow = (name: string, type: string, extratags = {}) =>
    ({ osm_type: "node", osm_id: name.length, lat: "52.521", lon: "13.405", name, category: "amenity", type, extratags });

  it("the address search fills in, one kind of place at a time", async () => {
    const searches: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (isOverpass(url)) return new Response("", { status: 504 });
      const u = new URL(url);
      searches.push(u);
      const q = u.searchParams.get("q");
      return new Response(JSON.stringify(q === "[amenity=restaurant]" ? [nominatimRow("Thai Corner", "restaurant", { cuisine: "thai", opening_hours: "Mo-Su 12:00-22:00" })] : []));
    }));
    const r = await fetchPlaces("food", {}, at, 1000, { timing: fast, searchSpacingMs: 0 });
    expect(r.via).toBe("search");
    expect(r.places).toEqual([{ id: "node/11", name: "Thai Corner", lat: 52.521, lon: 13.405, mood: "food",
      tags: { name: "Thai Corner", amenity: "restaurant", cuisine: "thai", opening_hours: "Mo-Su 12:00-22:00" } }]);
    expect(searches.map(u => u.searchParams.get("q")).sort()).toEqual(["[amenity=fast_food]", "[amenity=ice_cream]", "[amenity=restaurant]"]);
    expect(searches[0].searchParams.get("bounded")).toBe("1");
  });

  it("spaces out its requests as the address search’s rules require", async () => {
    const times: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (isOverpass(url)) return new Response("", { status: 504 });
      times.push(Date.now());
      return new Response("[]");
    }));
    await fetchPlaces("food", {}, at, 1000, { timing: fast, searchSpacingMs: 150 });
    expect(times).toHaveLength(3);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(140);
  });

  it("if that fails too, says so for each service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const err = await fetchPlaces("food", {}, at, 1000, { timing: fast, searchSpacingMs: 0 }).catch(e => e);
    expect(err).toBeInstanceOf(MapUnavailableError);
    expect(err.reasons.at(-1)).toBe("nominatim.openstreetmap.org: error 503");
  });
});

describe("place cache", () => {
  it("survives a restart, expires and stays small", () => {
    const store = memoryStore();
    let now = 0;
    const make = () => new PlaceCache(store, 1000, 2, "k", () => now);
    const a = make();
    a.set("q1", []); now = 10; a.set("q2", []); now = 20; a.set("q3", []);
    const b = make();
    expect(b.get("q1")).toBeNull();
    expect(b.get("q2")).toEqual([]);
    now = 2000;
    expect(b.get("q3")).toBeNull();
  });
});
