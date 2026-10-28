import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { address, factsSentence, hoursText, kindOf, trimText } from "../../core/describe";
import { isNarrowed } from "../../core/filters";
import { openInfo, openLine } from "../../core/hours";
import { arrivalAt } from "../../core/picker";
import { distKm, fmtKm, MODES, travelMin } from "../../core/travel";
import type { Partner, PlaceList } from "../../core/types";
import { backstory, type Backstory } from "../../data/wiki";
import { isApple, lang, prefersReducedMotion } from "../platform";
import type { usePicker } from "../usePicker";
import { SaveToList } from "./SaveToList";

type Picker = ReturnType<typeof usePicker>;

interface ResultProps {
  picker: Picker;
  names: Record<Partner, string>;
  onAccept: () => void;
  lists: PlaceList[];
  setLists: React.Dispatch<React.SetStateAction<PlaceList[]>>;
}

export function Result({ picker, names, onAccept, lists, setLists }: ResultProps) {
  const s = picker.state;
  if (s.kind === "idle") return null;
  if (s.kind === "loading") return (
    <div className="state">
      <svg className="counting" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="26" cy="26" r="18.5" /><circle cx="74" cy="26" r="18.5" /><circle cx="26" cy="74" r="18.5" /><circle cx="74" cy="74" r="18.5" />
      </svg>
      <p className="big">Eeny, meeny, miny…</p>
      <p>{s.settings.source === "list" ? "Going through your list." : `Checking what’s within ${s.settings.time} min ${MODES[s.settings.mode].verb}.`}</p>
      {s.slow && <>
        <p className="slow-note">The free map servers are slow right now. Still trying…</p>
        <p><button className="btn-link" type="button" onClick={picker.stop}>Stop</button></p>
      </>}
    </div>
  );
  if (s.kind === "error") return (
    <div className="state">
      <p className="big">The map didn’t answer</p>
      <p>The free map servers are busy or your connection dropped. Wait a moment and try again.</p>
      <p><button className="btn" type="button" onClick={picker.retry}>Try again</button></p>
      {s.reasons.length > 0 && (
        <details className="why"><summary>What happened</summary><ul>{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
      )}
    </div>
  );
  if (s.kind === "empty" && s.fromList) {
    const msg = s.turnedDown ? "You’ve turned down everything on the list that fits."
      : s.listEmpty ? "There’s nothing on it yet. Add places under Lists."
      : `Nothing on “${s.fromList}” fits right now. Try another mood, fewer filters${s.settings.anyDistance ? "" : ", “Any distance”"}, or pick somewhere new.`;
    return (
      <div className="state">
        <p className="big">{s.turnedDown ? "That was the last option" : "Nothing on your list fits"}</p>
        <p>{msg}{s.settings.skipClosed && !s.listEmpty ? " Places that are closed when you’d arrive are left out." : ""}</p>
      </div>
    );
  }
  if (s.kind === "empty") {
    const msg = s.turnedDown ? "You’ve turned down everything that fits. Widen the trip or add another mood."
      : isNarrowed(s.settings.moods, s.settings.refine) ? "Nothing matches those picks within reach. Loosen a filter, add a mood, or go a bit further."
      : "Nothing matches that mood within reach. Try a longer trip, another way of getting there, or another mood.";
    return (
      <div className="state">
        <p className="big">{s.turnedDown ? "That was the last option" : "Nothing in reach"}</p>
        <p>{msg}{s.settings.skipClosed ? " Places that are closed when you’d arrive are left out." : ""}</p>
      </div>
    );
  }
  const r = picker.round;
  const noVetoes = r.vetoes.a <= 0 && r.vetoes.b <= 0;
  return (
    <>
      <Ticket key={`${s.place.id}-${r.count}`} picker={picker} />
      <div className="decide">
        {!s.fromList && <SaveToList place={s.place} lists={lists} setLists={setLists} />}
        {r.done ? <p className="verdict">Saved to your timeline. Have fun, and rate it afterwards.</p> : <>
          <button type="button" className="yes" onClick={onAccept}>We’re going</button>
          {s.settings.vetoCount > 0 && (
            <div className="vetoes">
              {(["a", "b"] as Partner[]).map(w => (
                <button key={w} type="button" className="veto" disabled={r.vetoes[w] <= 0} onClick={() => picker.veto(w)}>
                  Nope<small>{names[w]}, {r.vetoes[w]} left</small>
                </button>
              ))}
            </div>
          )}
          <p className="verdict">
            {noVetoes && s.settings.vetoCount > 0 ? "No vetoes left. It’s decided."
              : s.fromList ? `Picked from ${s.pool} place${s.pool === 1 ? "" : "s"} on “${s.fromList}” that fit${s.pool === 1 ? "s" : ""}.`
              : `Picked from ${s.pool} place${s.pool === 1 ? "" : "s"} in reach.`}
          </p>
        </>}
      </div>
    </>
  );
}

function Ticket({ picker }: { picker: Picker }) {
  const s = picker.state as Extract<Picker["state"], { kind: "ticket" }>;
  const { place: p, settings } = s;
  const t = p.tags;
  const hasWiki = !!(t.wikidata || t.wikipedia);
  const ref = useRef<HTMLElement>(null);
  const factsRef = useRef<HTMLDListElement>(null);
  const [story, setStory] = useState<Backstory | null | "loading">(hasWiki ? "loading" : null);

  useEffect(() => {
    if (!hasWiki) return;
    const ctl = new AbortController();
    backstory(t, lang, ctl.signal).then(d => { if (!ctl.signal.aborted) setStory(d); });
    return () => ctl.abort();
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (ref.current && factsRef.current) ref.current.style.setProperty("--notch", factsRef.current.offsetTop + "px");
  });
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const km = settings.loc ? distKm(settings.loc, p) : null;
  const mins = km == null ? null : Math.max(1, Math.round(travelMin(km, settings.mode)));
  const m = MODES[settings.mode];
  const kind = kindOf(t);
  const arrival = settings.loc ? arrivalAt(p, settings, new Date()) : new Date();
  const open = openInfo(s.hoursLib, p, settings.loc, arrival);
  const addr = address(t);
  const hours = hoursText(t.opening_hours);
  const site = t.website || t["contact:website"];
  const fallback = (t.description ? trimText(t.description) : "") || factsSentence(t, kind) || "No description yet. Sometimes that’s the fun part.";

  return (
    <article className="ticket reveal" aria-label="Tonight’s pick" ref={ref}>
      <p className="t-kind">{s.fromList ? `${kind}, from ${s.fromList}` : kind}</p>
      <h2 className="t-name">{p.name}</h2>
      <dl className="t-facts" ref={factsRef}>
        {km != null && mins != null && <>
          <div><dt>Getting there</dt><dd>About {mins} min {m.verb}</dd></div>
          <div><dt>Distance</dt><dd>{fmtKm(km)} away</dd></div>
        </>}
        <div className="wide"><dt>Opening hours</dt><dd>{openLine(open, arrival)}</dd></div>
      </dl>
      {hasWiki && story === "loading"
        ? <p className="t-desc loading" id="tDesc">Getting the backstory…</p>
        : story && story !== "loading"
          ? <p className="t-desc" id="tDesc">{trimText(story.text)}{story.url && <small><a href={story.url} target="_blank" rel="noopener">More on Wikipedia</a></small>}</p>
          : <p className="t-desc" id="tDesc">{fallback}</p>}
      {addr && <p className="t-addr">{addr}</p>}
      {hours && <details className="t-hours"><summary>Full opening hours</summary><p>{hours}</p></details>}
      <div className="t-links">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=${m.gmaps}`} target="_blank" rel="noopener">Directions</a>
        {isApple() && <a href={`https://maps.apple.com/?daddr=${p.lat},${p.lon}&q=${encodeURIComponent(p.name)}&dirflg=${m.apple}`} target="_blank" rel="noopener">Apple Maps</a>}
        {site
          ? <a href={/^https?:\/\//.test(site) ? site : "https://" + site} target="_blank" rel="noopener">Website</a>
          : <a href={`https://www.openstreetmap.org/${p.id}`} target="_blank" rel="noopener">Details</a>}
      </div>
    </article>
  );
}
