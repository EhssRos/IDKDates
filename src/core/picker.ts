import { refineOk } from "./filters";
import { openInfo, type OpeningHoursLib } from "./hours";
import { distKm, travelMin } from "./travel";
import type { Place, Settings } from "./types";

/** Better documented places are likelier picks; tiny unnamed-in-history parks less so. */
export function weight(p: Pick<Place, "tags">): number {
  const t = p.tags;
  let w = 1;
  if (t.wikipedia || t.wikidata) w += 2;
  if (t.website || t["contact:website"]) w += 1;
  if (t.opening_hours) w += 0.5;
  if (t.leisure === "park" && !(t.wikipedia || t.wikidata)) w *= 0.6;
  return w;
}

export function weightedPick<T extends Pick<Place, "tags">>(list: T[], rng: () => number = Math.random): T {
  const total = list.reduce((s, p) => s + weight(p), 0);
  let r = rng() * total;
  for (const p of list) { r -= weight(p); if (r <= 0) return p; }
  return list[list.length - 1];
}

export const minutesTo = (p: Place, s: Pick<Settings, "loc" | "mode">) => travelMin(distKm(s.loc!, p), s.mode);
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

/** Whether a place may be picked right now. */
export function eligible(p: Place, c: PickContext): boolean {
  const s = c.settings;
  if (!s.loc) return false;
  if (c.rejected.has(p.id)) return false;
  if (s.skipBeen && c.visited.has(p.id)) return false;
  if (s.skipChains && (p.tags.brand || p.tags["brand:wikidata"])) return false;
  if (!refineOk(p, s.refine)) return false;
  if (minutesTo(p, s) > s.time) return false;
  if (s.skipClosed && openInfo(c.hoursLib, p, s.loc, arrivalAt(p, s, c.now)).state === "closed") return false;
  return true;
}

export function shuffle<T>(a: T[], rng: () => number = Math.random): T[] {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
