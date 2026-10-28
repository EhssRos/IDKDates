import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../../src/core/storage";
import { fetchPlaces, MapUnavailableError, OVERPASS_ENDPOINTS, parseElements, runQuery } from "../../src/data/overpass";
import { PlaceCache } from "../../src/data/placeCache";

afterEach(() => vi.unstubAllGlobals());
const at = { lat: 52.52, lon: 13.405 };
const answer = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 });

describe("map data", () => {
  it("turns map elements into places, skipping unnamed and duplicate ones", () => {
    const places = parseElements([
      { type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } },
      { type: "way", id: 2, center: { lat: 3, lon: 4 }, tags: { name: "B" } },
      { type: "node", id: 3, lat: 1, lon: 2, tags: {} },
      { type: "node", id: 4, lat: 1, lon: 2, tags: { name: "A" } }
    ], "food");
    expect(places).toEqual([
      { id: "node/1", name: "A", lat: 1, lon: 2, tags: { name: "A" }, mood: "food" },
      { id: "way/2", name: "B", lat: 3, lon: 4, tags: { name: "B" }, mood: "food" }
    ]);
  });

  it("falls back to the next server when one is busy", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? new Response("busy", { status: 504 }) : answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } }]);
    }));
    const places = await fetchPlaces("food", {}, at, 1000);
    expect(places.map(p => p.name)).toEqual(["A"]);
    expect(calls).toEqual(OVERPASS_ENDPOINTS.slice(0, 2));
  });

  it("gives up after every server fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 504 })));
    await expect(fetchPlaces("food", {}, at, 1000)).rejects.toThrow(/504/);
  });

  it("stops at once when cancelled", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    vi.stubGlobal("fetch", fetchMock);
    const ctl = new AbortController();
    const p = fetchPlaces("food", {}, at, 1000, { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses fresh results instead of asking again", async () => {
    const fetchMock = vi.fn(async () => answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A" } }]));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new PlaceCache(memoryStore());
    await fetchPlaces("food", {}, at, 1000, { cache });
    await fetchPlaces("food", {}, at, 1000, { cache });
    await fetchPlaces("food", { food: ["pizza"] }, at, 1000, { cache });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

describe("slow or broken map servers", () => {
  const fast = { hedgeAfterMs: 30, perServerMs: 400, deadlineMs: 800 };
  const hang = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) =>
    init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));

  it("asks the next server when the first is slow, and uses whichever answers first", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      calls.push(url);
      return url === OVERPASS_ENDPOINTS[0] ? hang(url, init) : Promise.resolve(answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Second" } }]));
    }));
    const started = Date.now();
    const places = await fetchPlaces("food", {}, at, 1000, { timing: fast });
    expect(places.map(p => p.name)).toEqual(["Second"]);
    expect(calls).toEqual(OVERPASS_ENDPOINTS.slice(0, 2));
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("treats an overloaded server’s “timed out” answer as a failure, not as an empty area", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++n === 1
      ? new Response(JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 21 seconds." }))
      : answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Real" } }])));
    const places = await fetchPlaces("food", {}, at, 1000, { timing: fast });
    expect(places.map(p => p.name)).toEqual(["Real"]);
  });

  it("gives up in time and says what each server did", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) =>
      url === OVERPASS_ENDPOINTS[0] ? new Response("", { status: 429 }) : hang(url, init)));
    const err = await runQuery("q", { timing: { ...fast, perServerMs: 5000 } }).catch(e => e);
    expect(err).toBeInstanceOf(MapUnavailableError);
    expect(err.reasons[0]).toBe("overpass-api.de: too many requests (429)");
    expect(err.reasons.at(-1)).toMatch(/gave up after/);
  });

  it("never caches a failed search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 504 })));
    const cache = new PlaceCache(memoryStore());
    await expect(fetchPlaces("food", {}, at, 1000, { cache, timing: fast })).rejects.toBeInstanceOf(MapUnavailableError);
    vi.stubGlobal("fetch", vi.fn(async () => answer([{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "Back" } }])));
    expect((await fetchPlaces("food", {}, at, 1000, { cache, timing: fast })).map(p => p.name)).toEqual(["Back"]);
  });
});
