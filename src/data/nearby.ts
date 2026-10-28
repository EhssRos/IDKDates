import { shuffle } from "../core/picker";
import { boxArea } from "../core/quality";
import type { LatLon, MoodId, Place } from "../core/types";
import { getJson } from "./http";

/**
 * The fallback when the map servers are down: OpenStreetMap’s address search (Nominatim) can list
 * places of one type inside a small box, up to 40 at a time. Its rules allow one request per second,
 * so this asks for a few types of place, one after another.
 */

/** The kinds of places to ask for per mood, as key=value pairs. */
export const SEARCH_TYPES: Record<MoodId, string[]> = {
  food: ["amenity=restaurant", "amenity=fast_food", "amenity=ice_cream"],
  drinks: ["amenity=cafe", "amenity=bar", "amenity=pub", "amenity=biergarten"],
  clubs: ["amenity=nightclub", "amenity=music_venue"],
  action: ["leisure=bowling_alley", "amenity=cinema", "leisure=escape_game", "leisure=miniature_golf", "leisure=amusement_arcade", "leisure=trampoline_park", "leisure=ice_rink"],
  nature: ["leisure=park", "natural=water", "landuse=forest", "leisure=nature_reserve", "tourism=viewpoint", "natural=beach"],
  culture: ["tourism=museum", "tourism=gallery", "amenity=theatre", "historic=castle", "historic=monument", "historic=ruins", "tourism=attraction", "tourism=zoo"]
};
/** At most this many requests per pick, so the fallback stays quick. */
const MAX_TYPES = 4;
/** Nominatim only allows type-only searches in a small box. */
const MAX_BOX_M = 15000;

let lastRequest = 0;
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (ms <= 0) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("Cancelled"), { name: "AbortError" })); }, { once: true });
});

interface Row { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; category?: string; type?: string; extratags?: Record<string, string> | null; boundingbox?: string[] }

export async function searchNearby(mood: MoodId, at: LatLon, radiusM: number, opts: { signal?: AbortSignal; spacingMs?: number } = {}): Promise<Place[]> {
  const spacing = opts.spacingMs ?? 1100;
  const r = Math.min(radiusM, MAX_BOX_M);
  const dLat = r / 111320, dLon = r / (111320 * Math.cos(at.lat * Math.PI / 180));
  const box = [at.lon - dLon, at.lat + dLat, at.lon + dLon, at.lat - dLat].map(n => n.toFixed(5)).join(",");
  const types = shuffle(SEARCH_TYPES[mood]).slice(0, MAX_TYPES);
  const seen = new Set<string>();
  const out: Place[] = [];
  let answered = 0;
  let lastError: unknown;
  for (const kv of types) {
    await pause(lastRequest + spacing - Date.now(), opts.signal);
    lastRequest = Date.now();
    try {
      const rows = await getJson<Row[]>(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(`[${kv}]`)}&viewbox=${box}&bounded=1&limit=40&extratags=1`, 12000, opts.signal);
      answered++;
      for (const row of rows) {
        const id = `${row.osm_type}/${row.osm_id}`;
        if (!row.name || seen.has(id)) continue;
        seen.add(id);
        const tags: Record<string, string> = { ...(row.extratags || {}), name: row.name };
        if (row.category && row.type) tags[row.category] = row.type;
        const place: Place = { id, name: row.name, lat: +row.lat, lon: +row.lon, tags, mood };
        // Nominatim’s box is [south, north, west, east].
        const bb = row.boundingbox?.map(Number);
        if (bb && bb.length === 4 && row.osm_type !== "node") {
          place.area = Math.round(boxArea(bb[0], bb[2], bb[1], bb[3]));
          place.bounds = { s: bb[0], n: bb[1], w: bb[2], e: bb[3] };
        }
        out.push(place);
      }
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      lastError = e;
    }
  }
  if (!answered) throw lastError ?? new Error("No answer");
  return out;
}
