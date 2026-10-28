import { useState } from "react";
import { kindOf } from "../../core/describe";
import { addToList, createList, deleteList, isOnList, listFor, removeFromList, renameList, setPlaceMoods, toSaved } from "../../core/lists";
import { MOOD_IDS, MOODS } from "../../core/moods";
import type { MoodId, PlaceList, SavedPlace, Settings } from "../../core/types";
import { searchPlaces, type PlaceHit } from "../../data/geocode";
import { lang } from "../platform";

interface Props {
  lists: PlaceList[];
  setLists: React.Dispatch<React.SetStateAction<PlaceList[]>>;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

/** Your own lists of places, to pick from when you want somewhere you already know is good. */
export default function ListsView({ lists, setLists, settings, update }: Props) {
  const [selected, setSelected] = useState<string>(() => listFor(lists, settings.listId).id);
  const list = listFor(lists, selected);
  const [naming, setNaming] = useState<null | "new" | "rename">(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const select = (id: string) => { setSelected(id); setConfirmDelete(false); setNaming(null); };
  const saveName = () => {
    if (naming === "new") {
      const r = createList(lists, name);
      setLists(r.lists);
      select(r.id);
      update({ listId: r.id });
    } else if (naming === "rename") setLists(ls => renameList(ls, list.id, name));
    setNaming(null);
  };
  const remove = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    const next = deleteList(lists, list.id);
    setLists(next);
    select(next[0].id);
    if (settings.listId === list.id) update({ listId: next[0].id });
  };

  return (
    <>
      <p className="tl-sum">Places you love, ready to be picked. On the Pick screen, choose “Our lists” to pick from one.</p>

      <div className="chips lists-tabs" role="group" aria-label="Your lists">
        {lists.map(l => (
          <button key={l.id} type="button" className="chip" aria-pressed={l.id === list.id} onClick={() => select(l.id)}>
            {l.name} <span className="count">{l.places.length}</span>
          </button>
        ))}
        <button type="button" className="chip new-list" onClick={() => { setNaming("new"); setName(""); }}>New list</button>
      </div>

      {naming && (
        <div className="field name-field">
          <input type="text" aria-label={naming === "new" ? "Name of the new list" : "New name for the list"} maxLength={40} autoFocus
            placeholder={naming === "new" ? "Lunch spots, Rainy days…" : list.name} value={name}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setNaming(null); }} />
          <button type="button" className="btn" onClick={saveName}>{naming === "new" ? "Create" : "Save"}</button>
        </div>
      )}

      <section className="list-panel" aria-labelledby="h-list">
        <div className="list-head">
          <h3 id="h-list">{list.name}</h3>
          <span className="list-actions">
            <button type="button" className="btn-link" onClick={() => { setNaming("rename"); setName(list.name); }}>Rename</button>
            <button type="button" className="btn-link danger" onClick={remove}>{confirmDelete ? "Tap again to delete" : lists.length > 1 ? "Delete list" : "Empty list"}</button>
          </span>
        </div>

        <AddPlace list={list} near={settings.loc} onAdd={(hit) => setLists(ls => addToList(ls, list.id, toSaved(hit.place)))} />

        {!list.places.length
          ? <p className="empty-hist list-empty">No places yet. Search for one above, or save picks from the Pick screen and your timeline.</p>
          : <><p className="list-sub">On this list</p><ul className="saved">{list.places.map(p => (
              <SavedRow key={p.id} p={p}
                onMoods={moods => setLists(ls => setPlaceMoods(ls, list.id, p.id, moods))}
                onRemove={() => setLists(ls => removeFromList(ls, list.id, p.id))} />
            ))}</ul></>}
      </section>
    </>
  );
}

function AddPlace({ list, near, onAdd }: { list: PlaceList; near: Settings["loc"]; onAdd: (h: PlaceHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [status, setStatus] = useState("");

  const search = async () => {
    const text = q.trim();
    if (!text) { setStatus("Type the name of a place first."); return; }
    setStatus("Searching…"); setHits(null);
    try {
      const found = await searchPlaces(text, lang, near);
      setHits(found);
      setStatus(found.length ? "" : `Nothing found for “${text}”. Try adding the city.`);
    } catch {
      setStatus("Couldn’t reach the place search. Check your connection.");
    }
  };

  return (
    <div className="add-place">
      <div className="field">
        <input type="text" aria-label="Search for a place to add" placeholder="Search a place by name" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") search(); }} />
        <button type="button" className="btn" onClick={search}>Search</button>
      </div>
      <p className="hint" role="status">{status || (near ? "Searches around your starting point first." : "Tip: set a starting point on the Pick screen to find places near you first.")}</p>
      {hits && hits.length > 0 && (
        <ul className="hits">
          {hits.map(h => {
            const added = isOnList(list, h.place.id);
            return (
              <li key={h.place.id}>
                <span className="h-main"><span className="h-name">{h.place.name}</span><span className="h-meta">{kindOf(h.place.tags)}{h.where ? `, ${h.where}` : ""}</span></span>
                <button type="button" className="btn" disabled={added} onClick={() => onAdd(h)} aria-label={added ? `${h.place.name} is on the list` : `Add ${h.place.name}`}>{added ? "Added" : "Add"}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SavedRow({ p, onMoods, onRemove }: { p: SavedPlace; onMoods: (m: MoodId[]) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const moodText = p.moods.length ? p.moods.map(m => MOODS[m].label).join(", ") : "No mood yet";
  return (
    <li className="saved-row" data-place={p.id}>
      <button type="button" className="saved-head" aria-expanded={open} onClick={() => { setOpen(o => !o); setConfirm(false); }}>
        <span className="h-name">{p.name}</span>
        <span className="h-meta">{kindOf(p.tags)}. {moodText}</span>
      </button>
      {open && (
        <div className="saved-body">
          <p className="hint">Picked for these moods:</p>
          <div className="chips" role="group" aria-label={`Moods for ${p.name}`}>
            {MOOD_IDS.map(m => (
              <button key={m} type="button" className="chip" aria-pressed={p.moods.includes(m)}
                onClick={() => onMoods(p.moods.includes(m) ? p.moods.filter(x => x !== m) : [...p.moods, m])}>{MOODS[m].label}</button>
            ))}
          </div>
          <div className="tl-actions">
            <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noopener">Directions</a>
            <button type="button" className="btn danger" onClick={() => (confirm ? onRemove() : setConfirm(true))}>{confirm ? "Tap again to remove" : "Remove"}</button>
          </div>
        </div>
      )}
    </li>
  );
}
