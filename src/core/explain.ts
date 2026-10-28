import { MOODS } from "./moods";
import type { LeftOut, LeftOutCounts } from "./picker";
import { MODES } from "./travel";
import type { Settings } from "./types";

const when = (d: Date, now: Date, locale?: string): string => {
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  return sameDay ? `at ${time}` : tomorrow ? `tomorrow at ${time}` : `${d.toLocaleDateString(locale, { weekday: "long" })} at ${time}`;
};

/** Why one place was left out, in a few words. */
export function leftOutText(r: LeftOut, s: Settings, now = new Date(), locale?: string): string {
  switch (r.why) {
    case "noStart": return "no starting point set";
    case "turnedDown": return "you turned it down";
    case "minor": return "too small or minor for an outing";
    case "visited": return "you’ve been there already";
    case "chain": return "it’s a big chain";
    case "filters": return "doesn’t match your filters";
    case "mood": return `isn’t marked as ${s.moods.map(m => MOODS[m].label).join(" or ")}`;
    case "tooFar": {
      const h = r.minutes / 60;
      const dur = r.minutes < 90 ? `${Math.round(r.minutes)} min` : `${h < 10 ? Math.round(h * 2) / 2 : Math.round(h)} hours`;
      return `about ${dur} ${MODES[s.mode].verb}, more than your ${s.time} min`;
    }
    case "closed": return r.closingSoon ? "closes soon after you’d get there"
      : r.opens ? `closed when you’d get there, opens ${when(r.opens, now, locale)}` : "closed when you’d get there";
  }
}

const are = (n: number) => (n === 1 ? "1 is" : `${n} are`);

/** One line per reason, most common first, for “we found places but none fit”. */
export function leftOutSummary(counts: LeftOutCounts, s: Settings): string[] {
  const line: Record<LeftOut["why"], (n: number) => string> = {
    tooFar: n => `${are(n)} more than ${s.time} min ${MODES[s.mode].verb} away`,
    closed: n => `${are(n)} closed or closing soon when you’d arrive`,
    filters: n => `${n} ${n === 1 ? "doesn’t" : "don’t"} match your filters`,
    chain: n => `${are(n)} big chains`.replace("1 is big chains", "1 is a big chain"),
    visited: n => `${n === 1 ? "1 place" : `${n} places`} you’ve been to already`,
    turnedDown: n => `${n === 1 ? "1 place" : `${n} places`} you turned down`,
    mood: n => `${n} ${n === 1 ? "doesn’t" : "don’t"} fit the moods you picked`,
    minor: n => `${are(n)} too small or minor for an outing`,
    noStart: () => "no starting point is set"
  };
  return (Object.entries(counts) as [LeftOut["why"], number][])
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => line[why](n));
}

export interface Fix { label: string; patch: Partial<Settings> }

/** One-tap ways to loosen what’s blocking a pick, most helpful first. */
export function suggestFixes(counts: LeftOutCounts, s: Settings): Fix[] {
  const fixes: { n: number; fix: Fix }[] = [];
  const add = (why: LeftOut["why"], fix: Fix | null) => { if (counts[why] && fix) fixes.push({ n: counts[why]!, fix }); };
  add("closed", s.skipClosed ? { label: "Include closed places", patch: { skipClosed: false } } : null);
  if (s.source === "list" && !s.anyDistance) add("tooFar", { label: "Any distance", patch: { anyDistance: true } });
  else add("tooFar", s.time < 90 ? { label: `Go up to ${Math.min(90, s.time + 15)} min`, patch: { time: Math.min(90, s.time + 15) } } : null);
  add("filters", { label: "Clear the filters", patch: { refine: {} } });
  add("mood", { label: "Any mood", patch: { moods: [] } });
  add("chain", s.skipChains ? { label: "Include chains", patch: { skipChains: false } } : null);
  add("visited", s.skipBeen ? { label: "Include places we’ve been", patch: { skipBeen: false } } : null);
  return fixes.sort((a, b) => b.n - a.n).slice(0, 3).map(f => f.fix);
}
