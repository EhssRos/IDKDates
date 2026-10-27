import type { OpeningHoursLib } from "../core/hours";

let loading: Promise<OpeningHoursLib | null> | null = null;

/** Loads the opening hours engine once. Resolves to null if it can't load, and the app treats hours as unknown. */
export function loadHoursLib(): Promise<OpeningHoursLib | null> {
  loading ??= import("./hoursEngine")
    .then(m => m.default as unknown as OpeningHoursLib)
    .catch(() => { loading = null; return null; });
  return loading;
}
