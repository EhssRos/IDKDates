import { lazy, Suspense, useEffect, useState } from "react";
import { trimText } from "../../core/describe";
import { avgRating, filterVisits, groupByMonth, TIMELINE_FILTERS, timelineSummary, type TimelineFilter } from "../../core/timeline";
import type { Partner, Visit } from "../../core/types";

const MapView = lazy(() => import("./MapView"));

interface Props {
  visits: Visit[];
  setVisits: React.Dispatch<React.SetStateAction<Visit[]>>;
  names: Record<Partner, string>;
}

export default function TimelineView({ visits, setVisits, names }: Props) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const change = (id: string, f: (v: Visit) => Visit) => setVisits(all => all.map(v => (v.visit === id ? f(v) : v)));
  const remove = (id: string) => {
    if (confirm !== id) { setConfirm(id); return; }
    setVisits(all => all.filter(v => v.visit !== id));
    setConfirm(null); setOpen(null);
  };

  useEffect(() => {
    if (!scrollTo) return;
    document.querySelector(`[data-visit="${CSS.escape(scrollTo)}"]`)?.scrollIntoView({ block: "center" });
    setScrollTo(null);
  }, [scrollTo]);

  const list = filterVisits(visits, filter);
  const mapped = list.filter(v => v.lat != null && v.lon != null);

  return (
    <>
      <p className="tl-sum" id="tlSum">{timelineSummary(visits)}</p>
      <div className="tl-map" id="tlMap" role="region" aria-label="Map of places you went" hidden={!mapped.length}>
        {mapped.length > 0 && (
          <Suspense fallback={null}>
            <MapView visits={mapped} onSelect={id => { setOpen(id); setScrollTo(id); }} />
          </Suspense>
        )}
      </div>
      <div className="chips tl-filter" id="tlFilter" role="group" aria-label="Show" hidden={!visits.length}>
        {(Object.keys(TIMELINE_FILTERS) as TimelineFilter[]).map(k => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{TIMELINE_FILTERS[k]}</button>
        ))}
      </div>
      <div id="tlList">
        {!visits.length ? (
          <div className="tl-empty"><p className="big">Nothing here yet</p><p>When you tap “We’re going” on a pick, it lands on your timeline. Then you can rate it together.</p></div>
        ) : !list.length ? (
          <div className="tl-empty"><p className="big">No matches</p><p>Nothing fits “{TIMELINE_FILTERS[filter]}” yet.</p></div>
        ) : groupByMonth(list).map(g => (
          <div key={g.month}>
            <h3 className="tl-month">{g.month}</h3>
            <ol className="tl-list">
              {g.visits.map(v => (
                <Entry key={v.visit} v={v} names={names} open={open === v.visit} confirming={confirm === v.visit}
                  onToggle={() => { setOpen(open === v.visit ? null : v.visit); setConfirm(null); }}
                  onRate={(w, n) => change(v.visit, x => ({ ...x, ratings: { ...x.ratings, [w]: x.ratings[w] === n ? 0 : n } }))}
                  onNote={note => change(v.visit, x => ({ ...x, note }))}
                  onLove={() => change(v.visit, x => ({ ...x, loved: !x.loved }))}
                  onRemove={() => remove(v.visit)} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </>
  );
}

const Dots = ({ n }: { n: number }) => (
  <span className="dots" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= Math.round(n) ? "on" : ""} />)}</span>
);

interface EntryProps {
  v: Visit; names: Record<Partner, string>; open: boolean; confirming: boolean;
  onToggle: () => void; onRate: (w: Partner, n: number) => void; onNote: (s: string) => void; onLove: () => void; onRemove: () => void;
}

function Entry({ v, names, open, confirming, onToggle, onRate, onNote, onLove, onRemove }: EntryProps) {
  const avg = avgRating(v);
  const date = new Date(v.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const bodyId = `tlb-${v.visit}`;
  return (
    <li className={"tl-item" + (v.loved ? " loved" : "")} data-visit={v.visit}>
      <span className="tl-node" aria-hidden="true" />
      <div className="tl-card">
        <button type="button" className="tl-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="tl-date">{date}</span>
          <span className="tl-name">{v.name}</span>
          <span className="tl-score">{avg ? <><Dots n={avg} /><span>{avg.toFixed(1)}</span></> : <span className="tl-kind">Rate it</span>}</span>
          <span className="tl-kind">{v.kind}</span>
          {v.note && !open && <span className="tl-note-preview">“{trimText(v.note, 90)}”</span>}
        </button>
        <div className="tl-body" id={bodyId} hidden={!open}>
          {(["a", "b"] as Partner[]).map(w => (
            <div className="rate-row" key={w}>
              <span className="who">{names[w]}</span>
              <span className="rate" role="group" aria-label={`${names[w]}’s rating`}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" className={n <= v.ratings[w] ? "on" : ""} aria-pressed={n === v.ratings[w]} aria-label={`${n} of 5`} onClick={() => onRate(w, n)} />
                ))}
              </span>
            </div>
          ))}
          <label className="note">What do you want to remember?
            <textarea maxLength={500} placeholder="The tiramisu. The rain. The waiter who sang." value={v.note} onChange={e => onNote(e.target.value)} />
          </label>
          <div className="tl-actions">
            <button type="button" className="btn" aria-pressed={v.loved} onClick={onLove}>{v.loved ? "Loved" : "Love it"}</button>
            {v.lat != null && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`} target="_blank" rel="noopener">Go again</a>}
            <button type="button" className="btn danger" onClick={onRemove}>{confirming ? "Tap again to remove" : "Remove"}</button>
          </div>
        </div>
      </div>
    </li>
  );
}
