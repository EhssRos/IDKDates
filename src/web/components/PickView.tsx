import { useState } from "react";
import { kindOf } from "../../core/describe";
import { MOODS, MOOD_IDS, REFINE } from "../../core/moods";
import { fmtKm, MAX_RADIUS_M, MODE_IDS, MODES, radiusKm } from "../../core/travel";
import { listFor } from "../../core/lists";
import type { MoodId, Partner, PlaceList, Settings, Visit } from "../../core/types";
import { describePoint, searchPlace } from "../../data/geocode";
import { lang } from "../platform";
import { usePicker } from "../usePicker";
import { Result } from "./Result";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  visits: Visit[];
  setVisits: React.Dispatch<React.SetStateAction<Visit[]>>;
  names: Record<Partner, string>;
  lists: PlaceList[];
  setLists: React.Dispatch<React.SetStateAction<PlaceList[]>>;
  goToLists: () => void;
}

export function PickView({ settings, update, visits, setVisits, names, lists, setLists, goToLists }: Props) {
  const picker = usePicker(settings, visits, lists);
  const fromList = settings.source === "list";
  const list = listFor(lists, settings.listId);
  const [formMsg, setFormMsg] = useState("");

  const go = () => {
    setFormMsg("");
    if (fromList && !list.places.length) { setFormMsg(`“${list.name}” is empty. Add places to it under Lists first.`); return; }
    if (!settings.loc && !(fromList && settings.anyDistance)) {
      setFormMsg("Set where you’re starting from first.");
      document.getElementById("locInput")?.focus();
      return;
    }
    if (!settings.moods.length && !fromList) { setFormMsg("Pick at least one mood."); return; }
    picker.start();
  };

  const accept = () => {
    if (picker.state.kind !== "ticket") return;
    const p = picker.state.place;
    setVisits(v => [{
      visit: `v${Date.now()}`, placeId: p.id, name: p.name, kind: kindOf(p.tags), mood: p.mood, lat: p.lat, lon: p.lon,
      date: Date.now(), loved: false, ratings: { a: 0, b: 0 }, note: "", tags: p.tags
    }, ...v].slice(0, 500));
    picker.markDone();
  };

  return (
    <>
      <StartingPoint settings={settings} update={update} />

      <section className="step" aria-labelledby="h-source">
        <h2 id="h-source">Pick from</h2>
        <div className="seg seg-2" id="source" role="group" aria-labelledby="h-source">
          <button type="button" aria-pressed={!fromList} onClick={() => update({ source: "map" })}>Somewhere new</button>
          <button type="button" aria-pressed={fromList} onClick={() => update({ source: "list" })}>Our lists</button>
        </div>
        {fromList && (
          <>
            {lists.length > 1 && (
              <div className="chips list-choice" role="group" aria-label="Which list">
                {lists.map(l => (
                  <button key={l.id} type="button" className="chip" aria-pressed={l.id === list.id} onClick={() => update({ listId: l.id })}>{l.name}</button>
                ))}
              </div>
            )}
            <p className="hint" id="sourceHint">
              {list.places.length
                ? `${list.places.length} place${list.places.length === 1 ? "" : "s"} on “${list.name}”. We pick one that fits your choices below.${settings.moods.length ? "" : " No mood picked, so anything on the list goes."}`
                : <>“{list.name}” is empty. <button type="button" className="btn-link inline" onClick={goToLists}>Add places</button></>}
            </p>
          </>
        )}
      </section>

      <MoodPicker settings={settings} update={update} />

      <section className="step" aria-labelledby="h-mode">
        <h2 id="h-mode">Getting there by</h2>
        <div className="seg" id="modes" role="group" aria-labelledby="h-mode">
          {MODE_IDS.map(m => (
            <button key={m} type="button" aria-pressed={settings.mode === m} onClick={() => update({ mode: m })}>{MODES[m].label}</button>
          ))}
        </div>
      </section>

      <section className="step" aria-labelledby="h-time">
        <div className="range-row">
          <h2 id="h-time" style={{ margin: 0 }}>Willing to travel</h2>
          <output id="timeOut" htmlFor="time">{fromList && settings.anyDistance ? "Any distance" : `${settings.time} min`}</output>
        </div>
        <input id="time" type="range" min={5} max={90} step={5} value={settings.time} aria-labelledby="h-time"
          disabled={fromList && settings.anyDistance} onChange={e => update({ time: +e.target.value })} />
        {fromList && (
          <Toggle id="anyDistance" label="Any distance, we don’t mind" checked={settings.anyDistance} onChange={v => update({ anyDistance: v })} />
        )}
        {!(fromList && settings.anyDistance) && (
          <p className="hint" id="radiusHint">
            Roughly {fmtKm(Math.min(MAX_RADIUS_M / 1000, radiusKm(settings.time, settings.mode)))} {MODES[settings.mode].verb}, as the crow flies.
          </p>
        )}
      </section>

      <section className="step toggles" aria-label="Options">
        {!fromList && <>
          <Toggle id="skipChains" label="Skip big chains" checked={settings.skipChains} onChange={v => update({ skipChains: v })} />
          <Toggle id="skipBeen" label="Skip places we’ve already been" checked={settings.skipBeen} onChange={v => update({ skipBeen: v })} />
        </>}
        <Toggle id="skipClosed" label="Skip places that are closed when we’d arrive" checked={settings.skipClosed} onChange={v => update({ skipClosed: v })} />
      </section>

      <details className="duo">
        <summary>You two</summary>
        <div className="duo-grid">
          <label>First name<input id="nameA" type="text" maxLength={20} placeholder="Me" value={settings.nameA} onChange={e => update({ nameA: e.target.value })} /></label>
          <label>Second name<input id="nameB" type="text" maxLength={20} placeholder="You" value={settings.nameB} onChange={e => update({ nameB: e.target.value })} /></label>
          <label>Vetoes each per pick
            <select id="vetoCount" value={String(settings.vetoCount)} onChange={e => update({ vetoCount: +e.target.value })}>
              {[0, 1, 2, 3].map(n => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </details>

      <button className="go" id="go" type="button" disabled={picker.busy} onClick={go}>Pick for us</button>
      <p className="form-msg" id="formMsg" role="alert">{formMsg}</p>

      <div id="result" aria-live="polite">
        <Result picker={picker} names={names} onAccept={accept} lists={lists} setLists={setLists} />
      </div>
    </>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>;
}

function StartingPoint({ settings, update }: Pick<Props, "settings" | "update">) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ text: string; tone?: "ok" | "err" } | null>(null);
  const shown = status ?? (settings.loc ? { text: settings.loc.label, tone: "ok" as const } : { text: "Not set yet" });

  const find = async () => {
    const q = query.trim();
    if (!q) { setStatus({ text: "Type an address, neighborhood or city first.", tone: "err" }); return; }
    setStatus({ text: "Looking that up…" });
    try {
      const found = await searchPlace(q, lang);
      if (!found) { setStatus({ text: `Couldn’t find “${q}”. Try adding the city.`, tone: "err" }); return; }
      update({ loc: found });
      setStatus(null);
    } catch {
      setStatus({ text: "Couldn’t reach the address search. Check your connection.", tone: "err" });
    }
  };

  const gps = () => {
    if (!navigator.geolocation) { setStatus({ text: "This browser can’t share your location. Type a place instead.", tone: "err" }); return; }
    setStatus({ text: "Finding you…" });
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      update({ loc: { lat, lon, label: "Your current location" } });
      setStatus(null);
      try {
        const d = await describePoint(lat, lon, lang);
        if (d) update({ loc: { lat, lon, cc: d.cc, state: d.state, label: d.near ? `Your location, near ${d.near}` : "Your current location" } });
      } catch { /* the plain label is fine */ }
    }, err => {
      setStatus({ text: err.code === 1 ? "Location access was blocked. Allow it in your browser settings, or type a place." : "Couldn’t get your location. Type a place instead.", tone: "err" });
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  };

  return (
    <section className="step" aria-labelledby="h-loc">
      <h2 id="h-loc">Starting from</h2>
      <div className="field">
        <input id="locInput" type="text" placeholder="Address, neighborhood or city" autoComplete="off" aria-label="Starting point"
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") find(); }} />
        <button className="btn" id="locFind" type="button" onClick={find}>Set</button>
      </div>
      <button className="btn-link" id="locGps" type="button" onClick={gps}>Use my current location</button>
      <p className={"loc-status" + (shown.tone ? " " + shown.tone : "")} id="locStatus" role="status">{shown.text}</p>
    </section>
  );
}

function MoodPicker({ settings, update }: Pick<Props, "settings" | "update">) {
  const toggleMood = (m: MoodId) =>
    update({ moods: settings.moods.includes(m) ? settings.moods.filter(x => x !== m) : [...settings.moods, m] });
  const toggleOption = (m: MoodId, k: string | null) => {
    const cur = settings.refine[m] || [];
    const next = k === null ? [] : cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    update({ refine: { ...settings.refine, [m]: next } });
  };

  return (
    <section className="step" aria-labelledby="h-vibe">
      <h2 id="h-vibe">In the mood for</h2>
      <div className="chips" id="vibes">
        {MOOD_IDS.map(m => (
          <button key={m} type="button" className="chip" aria-pressed={settings.moods.includes(m)} onClick={() => toggleMood(m)}>{MOODS[m].label}</button>
        ))}
      </div>
      <p className="hint">{settings.source === "list"
        ? "Optional when picking from a list. Pick one or more to narrow it down."
        : "Pick one or more. If you pick several, we choose between them too."}</p>
      <div id="refine">
        {settings.moods.map(m => {
          const r = REFINE[m], chosen = settings.refine[m] || [];
          return (
            <div key={m} className="refine" role="group" aria-label={`${MOODS[m].label}: ${r.ask}`}>
              <p className="refine-q"><strong>{MOODS[m].label}.</strong> {r.ask}</p>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!chosen.length} onClick={() => toggleOption(m, null)}>Anything</button>
                {Object.entries(r.options).map(([k, o]) => (
                  <button key={k} type="button" className="chip" aria-pressed={chosen.includes(k)} onClick={() => toggleOption(m, k)}>{o.label}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
