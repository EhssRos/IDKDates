import type { Place, StartPoint } from "./types";

/** The parts of the opening_hours library this app uses. */
export interface OpeningHours {
  getState(at: Date): boolean;
  getUnknown(at: Date): boolean;
  getNextChange(at: Date): Date | undefined;
}
export type OpeningHoursLib = new (value: string, nominatim: object | null, options?: object) => OpeningHours;

/** A place has to stay open at least this long after you arrive. */
export const MIN_STAY_MIN = 45;

export type OpenInfo =
  | { state: "unknown" }
  | { state: "closed" }
  | { state: "open"; until: Date | null; always: boolean };

const parsed = new WeakMap<object, OpeningHours | null>();

function parse(lib: OpeningHoursLib, p: Place, loc: StartPoint | null): OpeningHours | null {
  if (parsed.has(p)) return parsed.get(p)!;
  let oh: OpeningHours | null = null;
  const raw = p.tags.opening_hours;
  if (raw) {
    const where = { lat: p.lat, lon: p.lon, address: { country_code: loc?.cc || "", state: loc?.state || "" } };
    for (const nom of [where, null]) {
      try { oh = new lib(raw, nom, { tag_key: "opening_hours" }); break; } catch { /* try without location */ }
    }
  }
  parsed.set(p, oh);
  return oh;
}

/** Open, closed or unknown at the moment you would arrive. */
export function openInfo(lib: OpeningHoursLib | null, p: Place, loc: StartPoint | null, arrival: Date): OpenInfo {
  if (!lib) return { state: "unknown" };
  const oh = parse(lib, p, loc);
  if (!oh) return { state: "unknown" };
  try {
    if (oh.getUnknown(arrival)) return { state: "unknown" };
    if (!oh.getState(arrival)) return { state: "closed" };
    const next = oh.getNextChange(arrival) || null;
    if (next && next.getTime() - arrival.getTime() < MIN_STAY_MIN * 60000) return { state: "closed" };
    return { state: "open", until: next, always: !next && /^\s*24\/7\s*$/.test(p.tags.opening_hours || "") };
  } catch {
    return { state: "unknown" };
  }
}

export function openLine(info: OpenInfo, arrival: Date, locale?: string): string {
  if (info.state === "unknown") return "Hours unknown. Check before you go.";
  if (info.state === "closed") return "Closed when you get there";
  if (info.always) return "Open 24/7";
  if (!info.until || info.until.getTime() - arrival.getTime() > 20 * 3600000) return "Open when you get there";
  return `Open when you get there, until ${info.until.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}
