import type { Visit } from "./types";

export const avgRating = (v: Pick<Visit, "ratings">): number => {
  const r = [v.ratings.a, v.ratings.b].filter(Boolean);
  return r.length ? r.reduce((x, y) => x + y, 0) / r.length : 0;
};

export const TIMELINE_FILTERS = { all: "All", loved: "Loved", top: "Rated 4+", unrated: "Not rated yet" } as const;
export type TimelineFilter = keyof typeof TIMELINE_FILTERS;

const tests: Record<TimelineFilter, (v: Visit) => boolean> = {
  all: () => true,
  loved: v => v.loved,
  top: v => avgRating(v) >= 4,
  unrated: v => !avgRating(v)
};

export const filterVisits = (visits: Visit[], f: TimelineFilter): Visit[] =>
  visits.filter(tests[f]).sort((x, y) => y.date - x.date);

export function groupByMonth(visits: Visit[], locale?: string): { month: string; visits: Visit[] }[] {
  const out: { month: string; visits: Visit[] }[] = [];
  for (const v of visits) {
    const month = new Date(v.date).toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (out.at(-1)?.month !== month) out.push({ month, visits: [] });
    out.at(-1)!.visits.push(v);
  }
  return out;
}

export function timelineSummary(visits: Visit[], locale?: string): string {
  if (!visits.length) return "";
  const n = visits.length;
  const first = new Date(Math.min(...visits.map(v => v.date)));
  const rated = visits.filter(v => avgRating(v));
  let s = `${n} outing${n === 1 ? "" : "s"} together since ${first.toLocaleDateString(locale, { month: "long", year: "numeric" })}.`;
  if (rated.length) {
    const avg = rated.reduce((t, v) => t + avgRating(v), 0) / rated.length;
    const best = rated.slice().sort((x, y) => avgRating(y) - avgRating(x) || y.date - x.date)[0];
    s += ` Average rating ${avg.toFixed(1)}. Favorite so far: ${best.name}.`;
  }
  return s;
}
