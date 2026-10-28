import { chainTest, refineOk } from "./filters";
import { openInfo, type OpeningHoursLib } from "./hours";
import { MOOD_IDS, MOODS } from "./moods";
import { arrivalAt, minutesTo, type LeftOut } from "./picker";
import type { MoodId, Place, PlaceList, SavedPlace, Settings, Tags } from "./types";

/** Which moods a place fits, judged from its map data. */
export const moodsOf = (tags: Tags): MoodId[] =>
  MOOD_IDS.filter(m => MOODS[m].selectors.some(sel => chainTest(sel)(tags)));

export const starterLists = (): PlaceList[] => [{ id: "favorites", name: "Our favorites", places: [] }];

let counter = 0;
export const newListId = (now = Date.now()) => `l${now.toString(36)}${(counter++).toString(36)}`;

export function createList(lists: PlaceList[], name: string, now = Date.now()): { lists: PlaceList[]; id: string } {
  const id = newListId(now);
  const clean = name.trim() || "New list";
  return { lists: [...lists, { id, name: clean, places: [] }], id };
}

export const renameList = (lists: PlaceList[], id: string, name: string): PlaceList[] =>
  lists.map(l => (l.id === id && name.trim() ? { ...l, name: name.trim() } : l));

/** Removes a list; the last remaining list can’t be removed, it’s emptied instead. */
export function deleteList(lists: PlaceList[], id: string): PlaceList[] {
  const rest = lists.filter(l => l.id !== id);
  return rest.length ? rest : lists.map(l => ({ ...l, places: [] }));
}

export function toSaved(p: { id: string; name: string; lat: number; lon: number; tags: Tags }, moods?: MoodId[], now = Date.now()): SavedPlace {
  const detected = moods && moods.length ? moods : moodsOf(p.tags);
  return { id: p.id, name: p.name, lat: p.lat, lon: p.lon, tags: p.tags, moods: detected, added: now };
}

/** Adds a place to a list once; saving it again keeps the original. */
export const addToList = (lists: PlaceList[], listId: string, place: SavedPlace): PlaceList[] =>
  lists.map(l => (l.id !== listId || l.places.some(p => p.id === place.id) ? l : { ...l, places: [place, ...l.places] }));

export const removeFromList = (lists: PlaceList[], listId: string, placeId: string): PlaceList[] =>
  lists.map(l => (l.id === listId ? { ...l, places: l.places.filter(p => p.id !== placeId) } : l));

export const setPlaceMoods = (lists: PlaceList[], listId: string, placeId: string, moods: MoodId[]): PlaceList[] =>
  lists.map(l => (l.id === listId ? { ...l, places: l.places.map(p => (p.id === placeId ? { ...p, moods } : p)) } : l));

export const isOnList = (list: PlaceList | undefined, placeId: string) => !!list?.places.some(p => p.id === placeId);

export const listFor = (lists: PlaceList[], id: string | null): PlaceList => lists.find(l => l.id === id) ?? lists[0];

/** The moods a saved place is being considered for, given what you picked. */
function matchingMoods(sp: SavedPlace, s: Settings): MoodId[] {
  if (!s.moods.length) return sp.moods.length ? sp.moods : ["food"];
  return sp.moods.filter(m => s.moods.includes(m) && refineOk({ mood: m, tags: sp.tags }, s.refine));
}

export interface ListPickContext {
  settings: Settings;
  rejected: Set<string>;
  now: Date;
  hoursLib: OpeningHoursLib | null;
}

/**
 * Whether a saved place fits right now. Chains and places you’ve been to are not skipped:
 * you saved them on purpose. With no mood picked, anything on the list goes.
 */
export function listPlaceLeftOut(sp: SavedPlace, c: ListPickContext): LeftOut | null {
  const s = c.settings;
  if (c.rejected.has(sp.id)) return { why: "turnedDown" };
  if (s.moods.length && !sp.moods.some(m => s.moods.includes(m))) return { why: "mood" };
  if (!matchingMoods(sp, s).length) return { why: "filters" };
  const asPlace = toPlace(sp, s);
  if (!s.anyDistance) {
    if (!s.loc) return { why: "noStart" };
    const minutes = minutesTo(asPlace, s);
    if (minutes > s.time) return { why: "tooFar", minutes };
  }
  if (s.skipClosed) {
    const arrival = s.loc ? arrivalAt(asPlace, s, c.now) : c.now;
    const info = openInfo(c.hoursLib, asPlace, s.loc, arrival);
    if (info.state === "closed") return { why: "closed", opens: info.opens ?? null, closingSoon: !!info.closingSoon };
  }
  return null;
}

export const listPlaceFits = (sp: SavedPlace, c: ListPickContext): boolean => listPlaceLeftOut(sp, c) === null;

/** A saved place as a pickable place, under the first mood it’s being picked for. */
export const toPlace = (sp: SavedPlace, s: Settings): Place =>
  ({ id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon, tags: sp.tags, mood: matchingMoods(sp, s)[0] ?? sp.moods[0] ?? "food" });

const isMood = (m: unknown): m is MoodId => MOOD_IDS.includes(m as MoodId);

/** Repairs a list read from storage, or returns null if it’s beyond repair. */
export function normalizeList(raw: unknown): PlaceList | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.name !== "string") return null;
  const places = Array.isArray(l.places) ? l.places.flatMap((p): SavedPlace[] => {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || typeof p.name !== "string" || typeof p.lat !== "number" || typeof p.lon !== "number") return [];
    const tags = p.tags && typeof p.tags === "object" ? (p.tags as Tags) : {};
    return [{ id: p.id, name: p.name, lat: p.lat, lon: p.lon, tags, moods: Array.isArray(p.moods) ? p.moods.filter(isMood) : moodsOf(tags), added: Number(p.added) || 0 }];
  }) : [];
  return { id: l.id, name: l.name, places };
}
