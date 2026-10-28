import { MOOD_IDS } from "./moods";
import { MODE_IDS } from "./travel";
import { normalizeList, starterLists } from "./lists";
import type { MoodId, PlaceList, Settings, Tags, Visit } from "./types";

/**
 * A synchronous key-value store. The web app uses localStorage;
 * the native app can use react-native-mmkv, which has the same shape.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const PREFIX = "idkdates:v1:";
/** Prefixes used by earlier versions of the app (it was called Eeny). */
const LEGACY_PREFIXES = ["eeny:v1:"];
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  moods: ["food"], mode: "bike", time: 20, skipChains: true, skipBeen: true, skipClosed: true,
  refine: {}, nameA: "", nameB: "", vetoCount: 1, loc: null,
  source: "map", listId: null, anyDistance: false
};

const readJson = (store: KeyValueStore, key: string): unknown => {
  try { const raw = store.get(PREFIX + key); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
};
const writeJson = (store: KeyValueStore, key: string, value: unknown) => {
  try { store.set(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked: keep working in memory */ }
};

/** Brings saved data from any earlier version up to date. Safe to run on every start. */
export function migrate(store: KeyValueStore): void {
  try {
    for (const old of LEGACY_PREFIXES) for (const k of ["settings", "history"]) {
      const v = store.get(old + k);
      if (v != null && store.get(PREFIX + k) == null) store.set(PREFIX + k, v);
    }
    store.set(PREFIX + "schema", String(SCHEMA_VERSION));
  } catch { /* ignore */ }
}

const isMood = (m: unknown): m is MoodId => MOOD_IDS.includes(m as MoodId);

export function loadSettings(store: KeyValueStore): Settings {
  const raw = (readJson(store, "settings") || {}) as Record<string, unknown>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw as Partial<Settings>) };
  // Version 1 called moods "vibes".
  const moods = (raw.moods ?? raw.vibes) as unknown;
  s.moods = Array.isArray(moods) ? moods.filter(isMood) : DEFAULT_SETTINGS.moods;
  if (!MODE_IDS.includes(s.mode)) s.mode = DEFAULT_SETTINGS.mode;
  s.time = Math.min(90, Math.max(5, Number(s.time) || DEFAULT_SETTINGS.time));
  s.vetoCount = Math.min(3, Math.max(0, Number(s.vetoCount) || 0));
  if (raw.vetoCount === undefined) s.vetoCount = DEFAULT_SETTINGS.vetoCount;
  if (!s.refine || typeof s.refine !== "object") s.refine = {};
  if (s.source !== "list") s.source = "map";
  if (typeof s.listId !== "string") s.listId = null;
  s.anyDistance = !!s.anyDistance;
  return s;
}

export const saveSettings = (store: KeyValueStore, s: Settings) => writeJson(store, "settings", s);

export function loadHistory(store: KeyValueStore): Visit[] {
  const raw = readJson(store, "history");
  if (!Array.isArray(raw)) return [];
  return raw.filter(h => h && typeof h === "object" && h.name).map((h, i): Visit => ({
    // Version 1 kept one entry per place; now every visit is its own entry.
    visit: h.visit || `v${h.date || 0}_${i}`,
    placeId: h.placeId || h.id || "",
    name: String(h.name),
    kind: h.kind || "",
    mood: isMood(h.mood ?? h.vibe) ? (h.mood ?? h.vibe) : "",
    lat: typeof h.lat === "number" ? h.lat : null,
    lon: typeof h.lon === "number" ? h.lon : null,
    date: Number(h.date) || Date.now(),
    loved: !!h.loved,
    ratings: { a: Number(h.ratings?.a) || 0, b: Number(h.ratings?.b) || 0 },
    note: typeof h.note === "string" ? h.note : "",
    ...(h.tags && typeof h.tags === "object" ? { tags: h.tags as Tags } : {})
  }));
}

export const saveHistory = (store: KeyValueStore, visits: Visit[]) => writeJson(store, "history", visits);

export const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
};

/** Your own lists of places. There is always at least one. */
export function loadLists(store: KeyValueStore): PlaceList[] {
  const raw = readJson(store, "lists");
  const lists = Array.isArray(raw) ? raw.map(normalizeList).filter((l): l is PlaceList => l !== null) : [];
  return lists.length ? lists : starterLists();
}

export const saveLists = (store: KeyValueStore, lists: PlaceList[]) => writeJson(store, "lists", lists);
