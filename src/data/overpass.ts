import { selectorsFor } from "../core/filters";
import type { LatLon, MoodId, Place, Refinements } from "../core/types";
import { fetchWithTimeout, HttpError, isAbort } from "./http";
import type { PlaceCache } from "./placeCache";

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
export const DEFAULT_TIMING: QueryTiming = { hedgeAfterMs: 4000, perServerMs: 15000, deadlineMs: 25000 };

/** No map server could answer. `reasons` says what each one did, for the details shown to people. */
export class MapUnavailableError extends Error {
  constructor(public reasons: string[]) { super("No map server answered: " + reasons.join("; ")); this.name = "MapUnavailableError"; }
}

export function buildQuery(mood: MoodId, refine: Refinements, at: LatLon, radiusM: number): string {
  const filters = '["name"]["access"!~"^(private|no|customers)$"]';
  const parts = selectorsFor(mood, refine).map(s => `nwr${s}${filters}(around:${radiusM},${at.lat},${at.lon});`).join("");
  return `[out:json][timeout:20];(${parts});out center tags 1000;`;
}

interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: LatLon; tags?: Record<string, string> }
interface OsmAnswer { elements?: OsmElement[]; remark?: string }

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

/** Places for one mood around a point, from the cache when fresh. */
export async function fetchPlaces(
  mood: MoodId, refine: Refinements, at: LatLon, radiusM: number,
  opts: { signal?: AbortSignal; cache?: PlaceCache | null; endpoints?: string[]; timing?: Partial<QueryTiming> } = {}
): Promise<Place[]> {
  const q = buildQuery(mood, refine, { lat: +at.lat.toFixed(4), lon: +at.lon.toFixed(4) }, radiusM);
  const hit = opts.cache?.get(q);
  if (hit) return hit;
  const data = await runQuery(q, opts);
  const places = parseElements(data.elements || [], mood);
  opts.cache?.set(q, places);
  return places;
}
