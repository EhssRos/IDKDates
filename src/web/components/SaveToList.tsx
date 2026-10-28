import { useState } from "react";
import { addToList, isOnList, toSaved } from "../../core/lists";
import type { MoodId, PlaceList, Tags } from "../../core/types";

interface Props {
  place: { id: string; name: string; lat: number; lon: number; tags: Tags };
  moods?: MoodId[];
  lists: PlaceList[];
  setLists: React.Dispatch<React.SetStateAction<PlaceList[]>>;
}

/** “Save to a list”: one button with a single list, a short choice with several. */
export function SaveToList({ place, moods, lists, setLists }: Props) {
  const [open, setOpen] = useState(false);
  const save = (id: string) => setLists(ls => addToList(ls, id, toSaved(place, moods)));

  if (lists.length === 1) {
    const l = lists[0];
    const saved = isOnList(l, place.id);
    return (
      <button type="button" className="btn-link save-list" disabled={saved} onClick={() => save(l.id)}>
        {saved ? `Saved to ${l.name}` : `Save to ${l.name}`}
      </button>
    );
  }
  return (
    <div className="save-list">
      <button type="button" className="btn-link" aria-expanded={open} onClick={() => setOpen(o => !o)}>Save to a list</button>
      {open && (
        <div className="chips" role="group" aria-label="Save to which list">
          {lists.map(l => {
            const saved = isOnList(l, place.id);
            return <button key={l.id} type="button" className="chip" aria-pressed={saved} disabled={saved} onClick={() => save(l.id)}>{saved ? `${l.name} ✓` : l.name}</button>;
          })}
        </div>
      )}
    </div>
  );
}
