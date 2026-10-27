import { useCallback, useRef, useState } from "react";
import type { OpeningHoursLib } from "../core/hours";
import { eligible, shuffle, weightedPick } from "../core/picker";
import { radiusM } from "../core/travel";
import type { Partner, Place, Settings, Visit } from "../core/types";
import { isAbort } from "../data/http";
import { loadHoursLib } from "../data/hoursLib";
import { fetchPlaces } from "../data/overpass";
import { placeCache } from "./platform";

export interface Round { vetoes: Record<Partner, number>; rejected: Set<string>; done: boolean; count: number }

export type PickState =
  | { kind: "idle" }
  | { kind: "loading"; settings: Settings }
  | { kind: "ticket"; place: Place; pool: number; settings: Settings; hoursLib: OpeningHoursLib | null }
  | { kind: "empty"; settings: Settings; turnedDown: boolean }
  | { kind: "error" };

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

/**
 * The pick-veto-accept cycle. Every pick works from a snapshot of the settings taken when it
 * starts, and a newer pick cancels an older one, so changing settings mid-pick can’t mix results.
 */
export function usePicker(settings: Settings, visits: Visit[]) {
  const [state, setState] = useState<PickState>({ kind: "idle" });
  const round = useRef<Round>({ vetoes: { a: 0, b: 0 }, rejected: new Set(), done: false, count: 0 });
  const inflight = useRef<AbortController | null>(null);
  const latest = useRef({ settings, visits });
  latest.current = { settings, visits };

  const roll = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    const s = latest.current.settings;
    const visited = new Set(latest.current.visits.map(v => v.placeId));
    const r = round.current;
    setState({ kind: "loading", settings: s });
    try {
      const hoursLib = await withTimeout(loadHoursLib(), 8000);
      if (ctl.signal.aborted) return;
      const ctx = { settings: s, visited, rejected: r.rejected, now: new Date(), hoursLib };
      for (const mood of shuffle(s.moods)) {
        const places = await fetchPlaces(mood, s.refine, s.loc!, radiusM(s.time, s.mode), { signal: ctl.signal, cache: placeCache });
        if (ctl.signal.aborted) return;
        const options = places.filter(p => eligible(p, ctx));
        if (options.length) {
          r.count++;
          setState({ kind: "ticket", place: weightedPick(options), pool: options.length, settings: s, hoursLib });
          return;
        }
      }
      setState({ kind: "empty", settings: s, turnedDown: r.rejected.size > 0 });
    } catch (e) {
      if (ctl.signal.aborted || isAbort(e)) return;
      setState({ kind: "error" });
    } finally {
      if (inflight.current === ctl) inflight.current = null;
    }
  }, []);

  const start = useCallback(() => {
    const n = latest.current.settings.vetoCount;
    round.current = { vetoes: { a: n, b: n }, rejected: new Set(), done: false, count: 0 };
    return roll();
  }, [roll]);

  const veto = useCallback((who: Partner) => {
    const r = round.current;
    if (state.kind !== "ticket" || r.vetoes[who] <= 0) return;
    r.vetoes[who]--;
    r.rejected.add(state.place.id);
    return roll();
  }, [roll, state]);

  const markDone = useCallback(() => { round.current.done = true; setState(s => ({ ...s })); }, []);

  return { state, round: round.current, start, retry: roll, veto, markDone, busy: state.kind === "loading" };
}
