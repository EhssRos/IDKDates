// Shared shapes. Nothing in src/core may touch the browser, so it can be reused as-is in the native app.

export type MoodId = "food" | "drinks" | "clubs" | "action" | "nature" | "culture";
export type ModeId = "foot" | "bike" | "car";
export type Tags = Record<string, string>;

export interface LatLon { lat: number; lon: number }

export interface Place extends LatLon {
  /** OpenStreetMap id such as "node/123". */
  id: string;
  name: string;
  tags: Tags;
  mood: MoodId;
}

export interface StartPoint extends LatLon {
  label: string;
  /** ISO country code, used for public holidays. */
  cc?: string;
  state?: string;
}

export type Refinements = Partial<Record<MoodId, string[]>>;

export interface Settings {
  moods: MoodId[];
  mode: ModeId;
  /** Maximum travel time in minutes. */
  time: number;
  skipChains: boolean;
  skipBeen: boolean;
  skipClosed: boolean;
  refine: Refinements;
  nameA: string;
  nameB: string;
  vetoCount: number;
  loc: StartPoint | null;
  /** Pick somewhere new from the map, or from one of your own lists. */
  source: "map" | "list";
  /** Which list to pick from; null means the first one. */
  listId: string | null;
  /** When picking from a list: ignore travel time. */
  anyDistance: boolean;
}

export interface Visit {
  /** Unique per visit: going twice makes two visits. */
  visit: string;
  placeId: string;
  name: string;
  kind: string;
  mood: MoodId | "";
  lat: number | null;
  lon: number | null;
  /** Milliseconds since 1970. */
  date: number;
  loved: boolean;
  ratings: { a: number; b: number };
  note: string;
  /** Map details of the place, kept so it can be saved to a list later. */
  tags?: Tags;
}

/** A place someone saved to one of their lists. */
export interface SavedPlace extends LatLon {
  id: string;
  name: string;
  tags: Tags;
  /** Which moods it fits. Detected from the map data, and editable. */
  moods: MoodId[];
  added: number;
}

export interface PlaceList {
  id: string;
  name: string;
  places: SavedPlace[];
}

export type Partner = "a" | "b";
