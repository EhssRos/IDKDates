import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../../src/core/storage";
import { fetchPlaces, OVERPASS_ENDPOINTS, parseElements } from "../../src/data/overpass";
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
    await expect(p).rejects.toThrow(/aborted/);
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
