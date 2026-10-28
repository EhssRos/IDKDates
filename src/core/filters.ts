import { MOODS, REFINE } from "./moods";
import type { MoodId, Place, Refinements, Tags } from "./types";

// One condition: ["key"="value"], ["key"~"regex"(,i)], ["key"!~"regex"], ["key"] (has the key) or [!"key"] (doesn’t).
const COND = /\[(!?)"([^"]+)"(?:(=|~|!~)"((?:[^"\\]|\\.)*)"(,i)?)?\]/g;
const cache = new Map<string, (t: Tags) => boolean>();

/** Tests tags against an OpenStreetMap selector chain the same way the map server does. */
export function chainTest(chain: string): (t: Tags) => boolean {
  let fn = cache.get(chain);
  if (!fn) {
    const conds = [...chain.matchAll(COND)].map(([, not, k, op, v, i]) => {
      if (!op) return (t: Tags) => (t[k] != null) !== !!not;
      const re = op === "=" ? null : new RegExp(v, i ? "i" : "");
      return (t: Tags) => {
        const val = t[k];
        if (op === "=") return val === v;
        const hit = val != null && re!.test(val);
        return op === "~" ? hit : !hit;
      };
    });
    fn = (t: Tags) => conds.every(c => c(t));
    cache.set(chain, fn);
  }
  return fn;
}

const picked = (mood: MoodId, refine: Refinements) =>
  (refine[mood] || []).filter(k => REFINE[mood]?.options[k]);

/** Selector chains for a mood, narrowed by the chosen filters. */
export function selectorsFor(mood: MoodId, refine: Refinements): string[] {
  const keys = picked(mood, refine);
  if (!keys.length) return MOODS[mood].selectors;
  return [...new Set(keys.flatMap(k => REFINE[mood].options[k].q))];
}

/** Same group widens (Asian or Italian); different groups narrow (Asian and veggie). */
export function refineOk(place: Pick<Place, "mood" | "tags">, refine: Refinements): boolean {
  const keys = picked(place.mood, refine);
  if (!keys.length) return true;
  const r = REFINE[place.mood];
  const groups: Record<string, string[]> = {};
  for (const k of keys) (groups[r.options[k].group || "kind"] ??= []).push(k);
  return Object.values(groups).every(ks => ks.some(k => r.options[k].q.some(c => chainTest(c)(place.tags))));
}

export const isNarrowed = (moods: MoodId[], refine: Refinements) => moods.some(m => picked(m, refine).length > 0);
