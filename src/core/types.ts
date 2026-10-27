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
}

export type Partner = "a" | "b";
