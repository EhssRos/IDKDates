import { selectorsFor } from "../core/filters";
import type { LatLon, MoodId, Place, Refinements } from "../core/types";
import { fetchWithTimeout, HttpError, isAbort } from "./http";
import type { PlaceCache } from "./placeCache";

/** Public Overpass (OpenStreetMap) servers, tried in order. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

export function buildQuery(mood: MoodId, refine: Refinements, at: LatLon, radiusM: number): string {
  const filters = '["name"]["access"!~"^(private|no|customers)$"]';
  const parts = selectorsFor(mood, refine).map(s => `nwr${s}${filters}(around:${radiusM},${at.lat},${at.lon});`).join("");
  return `[out:json][timeout:25];(${parts});out center tags 1500;`;
}

interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: LatLon; tags?: Record<string, string> }

export function parseElements(elements: OsmElement[], mood: MoodId): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    const name = el.tags?.name;
    if (lat == null || lon == null || !name || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: `${el.type}/${el.id}`, name, lat, lon, tags: el.tags!, mood });
  }
  return out;
}

async function runQuery(q: string, signal?: AbortSignal, endpoints = OVERPASS_ENDPOINTS): Promise<{ elements: OsmElement[] }> {
  let last: unknown;
  for (const url of endpoints) {
    try {
      const r = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q)
      }, 30000, signal);
      if (!r.ok) throw new HttpError(r.status, url);
      return await r.json();
    } catch (e) {
      if (isAbort(e) && signal?.aborted) throw e;
      last = e;
    }
  }
  throw last ?? new Error("No map server answered");
}

/** Places for one mood around a point, from the cache when fresh. */
export async function fetchPlaces(
  mood: MoodId, refine: Refinements, at: LatLon, radiusM: number,
  opts: { signal?: AbortSignal; cache?: PlaceCache | null; endpoints?: string[] } = {}
): Promise<Place[]> {
  const q = buildQuery(mood, refine, { lat: +at.lat.toFixed(4), lon: +at.lon.toFixed(4) }, radiusM);
  const hit = opts.cache?.get(q);
  if (hit) return hit;
  const data = await runQuery(q, opts.signal, opts.endpoints);
  const places = parseElements(data.elements || [], mood);
  opts.cache?.set(q, places);
  return places;
}
