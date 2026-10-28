import { selectorsFor } from "../core/filters";
import { MOODS } from "../core/moods";
import { boxArea } from "../core/quality";
import type { LatLon, MoodId, Place, Refinements } from "../core/types";
import { fetchWithTimeout, HttpError, isAbort } from "./http";
import type { PlaceCache } from "./placeCache";
import { searchNearby } from "./nearby";

/**
 * Public Overpass (OpenStreetMap) servers with worldwide data. They are free, shared and
 * often overloaded, so the app asks a second one when the first is slow (see runQuery).
 * For a public launch, replace these with your own server or a paid provider.
 */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

export interface QueryTiming {
  /** Ask the next server if the current one hasn’t answered by then. */
  hedgeAfterMs: number;
  /** Give up on a single server after this long. */
  perServerMs: number;
  /** Give up altogether after this long. */
  deadlineMs: number;
}
// Busy servers often need 10 to 20 seconds. Wait for them, ask a second one after a while,
// and leave enough time for the fallback (see fetchPlaces) within about half a minute.
export const DEFAULT_TIMING: QueryTiming = { hedgeAfterMs: 7000, perServerMs: 20000, deadlineMs: 20000 };

/** No map server could answer. `reasons` says what each one did, for the details shown to people. */
export class MapUnavailableError extends Error {
  constructor(public reasons: string[]) { super("No map server answered: " + reasons.join("; ")); this.name = "MapUnavailableError"; }
}

/** The box around a point that contains a circle of `radiusM` meters. */
export function boxAround(at: LatLon, radiusM: number) {
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(at.lat * Math.PI / 180));
  const r = (n: number) => +n.toFixed(5);
  return { s: r(at.lat - dLat), w: r(at.lon - dLon), n: r(at.lat + dLat), e: r(at.lon + dLon) };
}

/**
 * The map query. The [bbox] setting lets the server narrow down by area first, which is far
 * cheaper than matching tags worldwide; relations are skipped (almost never venues) and the
 * access check happens on the device, so busy servers have less work to do.
 */
export function buildQuery(mood: MoodId, refine: Refinements, at: LatLon, radiusM: number): string {
  const b = boxAround(at, radiusM);
  const types = MOODS[mood].relations ? "nwr" : "nw";
  const parts = selectorsFor(mood, refine).map(s => `${types}${s}["name"](around:${radiusM},${at.lat},${at.lon});`).join("");
  // “bb” returns each shape’s bounding box: its middle is where we send you, its size weeds out tiny features.
  return `[out:json][timeout:25][bbox:${b.s},${b.w},${b.n},${b.e}];(${parts});out tags bb 500;`;
}

const PRIVATE = /^(private|no|customers)$/;

interface OsmBounds { minlat: number; minlon: number; maxlat: number; maxlon: number }
interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: LatLon; bounds?: OsmBounds; tags?: Record<string, string> }
interface OsmAnswer { elements?: OsmElement[]; remark?: string }

export function parseElements(elements: OsmElement[], mood: MoodId): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const el of elements) {
    const b = el.bounds;
    const lat = el.lat ?? el.center?.lat ?? (b ? (b.minlat + b.maxlat) / 2 : undefined);
    const lon = el.lon ?? el.center?.lon ?? (b ? (b.minlon + b.maxlon) / 2 : undefined);
    const name = el.tags?.name;
    if (lat == null || lon == null || !name || seen.has(name) || PRIVATE.test(el.tags?.access || "")) continue;
    seen.add(name);
    const place: Place = { id: `${el.type}/${el.id}`, name, lat, lon, tags: el.tags!, mood };
    if (b) {
      place.area = Math.round(boxArea(b.minlat, b.minlon, b.maxlat, b.maxlon));
      place.bounds = { s: b.minlat, w: b.minlon, n: b.maxlat, e: b.maxlon };
    }
    out.push(place);
  }
  return out;
}

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
function reason(e: unknown, url: string): string {
  if (e instanceof HttpError) return `${host(url)}: ${e.status === 429 ? "too many requests (429)" : e.status === 504 ? "overloaded (504)" : `error ${e.status}`}`;
  if (isAbort(e)) return `${host(url)}: no answer in time`;
  if (e instanceof Error && e.message.startsWith("Overpass:")) return `${host(url)}: ${e.message.slice(10)}`;
  return `${host(url)}: unreachable`;
}

/**
 * Sends the query to the first server, and to the next one whenever the current one fails or
 * takes longer than `hedgeAfterMs`. The first good answer wins and the others are cancelled.
 */
export function runQuery(q: string, opts: { signal?: AbortSignal; endpoints?: string[]; timing?: Partial<QueryTiming> } = {}): Promise<OsmAnswer> {
  const endpoints = opts.endpoints ?? OVERPASS_ENDPOINTS;
  const t = { ...DEFAULT_TIMING, ...opts.timing };
  return new Promise((resolve, reject) => {
    const running: AbortController[] = [];
    const reasons: string[] = [];
    let started = 0, failed = 0, done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer); clearTimeout(deadline);
      opts.signal?.removeEventListener("abort", onAbort);
      running.forEach(c => c.abort());
      fn();
    };
    const onAbort = () => finish(() => reject(Object.assign(new Error("Cancelled"), { name: "AbortError" })));
    const deadline = setTimeout(() => finish(() => reject(new MapUnavailableError([...reasons, "gave up after " + Math.round(t.deadlineMs / 1000) + " seconds"]))), t.deadlineMs);

    const startNext = () => {
      clearTimeout(hedgeTimer);
      if (done || started >= endpoints.length) return;
      const url = endpoints[started++];
      const ctl = new AbortController();
      running.push(ctl);
      hedgeTimer = setTimeout(startNext, t.hedgeAfterMs);
      fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q)
      }, t.perServerMs, ctl.signal)
        .then(async r => {
          if (!r.ok) throw new HttpError(r.status, url);
          const j = (await r.json()) as OsmAnswer;
          // Overpass reports timeouts and overload inside a normal-looking answer.
          if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error("Overpass: " + (/timed out/i.test(j.remark) ? "query timed out" : "server error"));
          finish(() => resolve(j));
        })
        .catch(e => {
          if (done) return;
          reasons.push(reason(e, url));
          failed++;
          if (failed >= endpoints.length) finish(() => reject(new MapUnavailableError(reasons)));
          else if (failed >= started) startNext();
        });
    };

    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    startNext();
  });
}

export interface FetchResult {
  places: Place[];
  /** "map" for the full map data; "search" when the map servers were busy and the address search filled in. */
  via: "map" | "search";
}

/**
 * Places for one mood around a point, from the cache when fresh. If every map server fails,
 * falls back to OpenStreetMap’s address search, which knows fewer places but answers reliably.
 */
export async function fetchPlaces(
  mood: MoodId, refine: Refinements, at: LatLon, radiusM: number,
  opts: { signal?: AbortSignal; cache?: PlaceCache | null; endpoints?: string[]; timing?: Partial<QueryTiming>; fallback?: boolean; searchSpacingMs?: number } = {}
): Promise<FetchResult> {
  const center = { lat: +at.lat.toFixed(4), lon: +at.lon.toFixed(4) };
  const q = buildQuery(mood, refine, center, radiusM);
  const hit = opts.cache?.get(q);
  if (hit) return { places: hit, via: "map" };
  try {
    const data = await runQuery(q, opts);
    const places = parseElements(data.elements || [], mood);
    opts.cache?.set(q, places);
    return { places, via: "map" };
  } catch (e) {
    if (!(e instanceof MapUnavailableError) || opts.fallback === false || opts.signal?.aborted) throw e;
    const key = `search:${mood}:${center.lat},${center.lon}:${radiusM}`;
    const cached = opts.cache?.get(key);
    if (cached) return { places: cached, via: "search" };
    try {
      const places = await searchNearby(mood, center, radiusM, { signal: opts.signal, spacingMs: opts.searchSpacingMs });
      opts.cache?.set(key, places);
      return { places, via: "search" };
    } catch (e2) {
      if (isAbort(e2) && opts.signal?.aborted) throw e2;
      throw new MapUnavailableError([...e.reasons, `nominatim.openstreetmap.org: ${e2 instanceof HttpError ? `error ${e2.status}` : "unreachable"}`]);
    }
  }
}
