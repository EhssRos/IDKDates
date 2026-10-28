import { refineOk } from "./filters";
import { openInfo, type OpeningHoursLib } from "./hours";
import { worthATrip } from "./quality";
import { distKm, goalFor, travelMin } from "./travel";
import type { Place, Settings } from "./types";

/** Better documented places are likelier picks; tiny unnamed-in-history parks less so. */
export function weight(p: Pick<Place, "tags" | "area">): number {
  const t = p.tags;
  let w = 1;
  if (t.wikipedia || t.wikidata) w += 2;
  if (t.website || t["contact:website"]) w += 1;
  if (t.opening_hours) w += 0.5;
  if ((p.area ?? 0) >= 100000) w += 1;
  return w;
}

export function weightedPick<T extends Pick<Place, "tags" | "area">>(list: T[], rng: () => number = Math.random): T {
  const total = list.reduce((s, p) => s + weight(p), 0);
  let r = rng() * total;
  for (const p of list) { r -= weight(p); if (r <= 0) return p; }
  return list[list.length - 1];
}

export const kmTo = (p: Place, from: Settings["loc"]) => distKm(from!, goalFor(p, from));
export const minutesTo = (p: Place, s: Pick<Settings, "loc" | "mode">) => travelMin(kmTo(p, s.loc), s.mode);
export const arrivalAt = (p: Place, s: Pick<Settings, "loc" | "mode">, now: Date) => new Date(now.getTime() + minutesTo(p, s) * 60000);

export interface PickContext {
  settings: Settings;
  /** OpenStreetMap ids of places already visited. */
  visited: Set<string>;
  /** Ids turned down in this round. */
  rejected: Set<string>;
  now: Date;
  hoursLib: OpeningHoursLib | null;
}

/** Why a place was left out of a pick. */
export type LeftOut =
  | { why: "noStart" }
  | { why: "turnedDown" }
  | { why: "minor" }
  | { why: "visited" }
  | { why: "chain" }
  | { why: "filters" }
  | { why: "mood" }
  | { why: "tooFar"; minutes: number }
  | { why: "closed"; opens: Date | null; closingSoon: boolean };

/** Why a place can’t be picked right now, or null if it can. */
export function leftOut(p: Place, c: PickContext): LeftOut | null {
  const s = c.settings;
  if (!s.loc) return { why: "noStart" };
  if (c.rejected.has(p.id)) return { why: "turnedDown" };
  if (!worthATrip(p)) return { why: "minor" };
  if (s.skipBeen && c.visited.has(p.id)) return { why: "visited" };
  if (s.skipChains && (p.tags.brand || p.tags["brand:wikidata"])) return { why: "chain" };
  if (!refineOk(p, s.refine)) return { why: "filters" };
  const minutes = minutesTo(p, s);
  if (minutes > s.time) return { why: "tooFar", minutes };
  if (s.skipClosed) {
    const info = openInfo(c.hoursLib, p, s.loc, arrivalAt(p, s, c.now));
    if (info.state === "closed") return { why: "closed", opens: info.opens ?? null, closingSoon: !!info.closingSoon };
  }
  return null;
}

/** Whether a place may be picked right now. */
export const eligible = (p: Place, c: PickContext): boolean => leftOut(p, c) === null;

/** How many places were left out for each reason. */
export type LeftOutCounts = Partial<Record<LeftOut["why"], number>>;
export function countLeftOut(reasons: (LeftOut | null)[]): LeftOutCounts {
  const out: LeftOutCounts = {};
  for (const r of reasons) if (r) out[r.why] = (out[r.why] ?? 0) + 1;
  return out;
}

export function shuffle<T>(a: T[], rng: () => number = Math.random): T[] {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
