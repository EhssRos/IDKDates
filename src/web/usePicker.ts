import { useCallback, useRef, useState } from "react";
import type { OpeningHoursLib } from "../core/hours";
import { listFor, listPlaceFits, toPlace } from "../core/lists";
import { eligible, shuffle, weightedPick } from "../core/picker";
import { radiusM } from "../core/travel";
import type { Partner, Place, PlaceList, Settings, Visit } from "../core/types";
import { isAbort } from "../data/http";
import { loadHoursLib } from "../data/hoursLib";
import { fetchPlaces, MapUnavailableError } from "../data/overpass";
import { placeCache } from "./platform";

export interface Round { vetoes: Record<Partner, number>; rejected: Set<string>; done: boolean; count: number }

export type PickState =
  | { kind: "idle" }
  | { kind: "loading"; settings: Settings; slow: boolean }
  | { kind: "ticket"; place: Place; pool: number; settings: Settings; hoursLib: OpeningHoursLib | null; fromList?: string }
  | { kind: "empty"; settings: Settings; turnedDown: boolean; fromList?: string; listEmpty?: boolean }
  | { kind: "error"; reasons: string[] };

/** After this long, the loading screen says the map is slow and offers to stop. */
export const SLOW_AFTER_MS = 6000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

/**
 * The pick-veto-accept cycle. Every pick works from a snapshot of the settings taken when it
 * starts, and a newer pick cancels an older one, so changing settings mid-pick can’t mix results.
 */
export function usePicker(settings: Settings, visits: Visit[], lists: PlaceList[]) {
  const [state, setState] = useState<PickState>({ kind: "idle" });
  const round = useRef<Round>({ vetoes: { a: 0, b: 0 }, rejected: new Set(), done: false, count: 0 });
  const inflight = useRef<AbortController | null>(null);
  const latest = useRef({ settings, visits, lists });
  latest.current = { settings, visits, lists };

  const roll = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    const s = latest.current.settings;
    const visited = new Set(latest.current.visits.map(v => v.placeId));
    const r = round.current;
    setState({ kind: "loading", settings: s, slow: false });
    const slowTimer = setTimeout(() => {
      if (inflight.current === ctl) setState(st => (st.kind === "loading" ? { ...st, slow: true } : st));
    }, SLOW_AFTER_MS);
    try {
      const hoursLib = await withTimeout(loadHoursLib(), 4000);
      if (ctl.signal.aborted) return;

      if (s.source === "list") {
        // Your own list: no map server needed.
        const list = listFor(latest.current.lists, s.listId);
        const options = list.places.filter(sp => listPlaceFits(sp, { settings: s, rejected: r.rejected, now: new Date(), hoursLib }));
        if (options.length) {
          r.count++;
          const pick = options[Math.floor(Math.random() * options.length)];
          setState({ kind: "ticket", place: toPlace(pick, s), pool: options.length, settings: s, hoursLib, fromList: list.name });
        } else {
          setState({ kind: "empty", settings: s, turnedDown: r.rejected.size > 0, fromList: list.name, listEmpty: !list.places.length });
        }
        return;
      }

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
      setState({ kind: "error", reasons: e instanceof MapUnavailableError ? e.reasons : [e instanceof Error ? e.message : String(e)] });
    } finally {
      clearTimeout(slowTimer);
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

  const stop = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
    setState({ kind: "idle" });
  }, []);

  const markDone = useCallback(() => { round.current.done = true; setState(s => ({ ...s })); }, []);

  return { state, round: round.current, start, retry: roll, veto, stop, markDone, busy: state.kind === "loading" };
}
