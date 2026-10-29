import { starterLists } from "./lists";
import type { MoodId, PlaceList, SavedPlace, Tags, Visit } from "./types";

/*
 * Sharing lists and the timeline between two phones.
 *
 * Everything is saved on the phone first and synced in the background (“local first”).
 * For syncing, the app’s data is flattened into small items (a list, a place on a list,
 * a visit, one person’s rating), each with a key. The engine remembers the last state both
 * sides agreed on (the “shadow”). Comparing the phone with the shadow shows what changed here;
 * what the server sends shows what changed there. If both changed the same item, this phone’s
 * version wins and is sent up: the last change wins.
 */

export type ItemKind = "list" | "place" | "visit" | "rating";

export interface Item {
  kind: ItemKind;
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  /** Who a rating belongs to. */
  owner?: string | null;
}

/** An item as the server returns it. */
export interface RemoteItem extends Item {
  updated_at: string;
}

export type ItemMap = Record<string, Item>;

export const keyOf = (i: Pick<Item, "kind" | "id">) => `${i.kind}:${i.id}`;

/** Who is “me” and who is the partner, by account id. */
export interface People { me: string | null; partner: string | null }

// ─── Phone data → items ──────────────────────────────────────────────────────

export function flatten(lists: PlaceList[], visits: Visit[], people: People): ItemMap {
  const out: ItemMap = {};
  const put = (i: Item) => { out[keyOf(i)] = i; };
  lists.forEach((l, i) => {
    put({ kind: "list", id: l.id, deleted: false, data: { name: l.name, created: l.created ?? i } });
    for (const p of l.places) {
      const { id, ...rest } = p;
      put({ kind: "place", id: `${l.id}|${id}`, deleted: false, data: { listId: l.id, placeId: id, ...rest } });
    }
  });
  for (const v of visits) {
    const { visit, ratings, ...rest } = v;
    put({ kind: "visit", id: visit, deleted: false, data: { ...rest } });
    if (people.me && ratings.a) put({ kind: "rating", id: `${visit}|${people.me}`, deleted: false, owner: people.me, data: { visit, stars: ratings.a } });
    if (people.partner && ratings.b) put({ kind: "rating", id: `${visit}|${people.partner}`, deleted: false, owner: people.partner, data: { visit, stars: ratings.b } });
  }
  return out;
}

// ─── Items → phone data ──────────────────────────────────────────────────────

export function unflatten(items: ItemMap, people: People, localOnly?: { visits: Visit[] }): { lists: PlaceList[]; visits: Visit[] } {
  const all = Object.values(items).filter(i => !i.deleted);
  const lists: PlaceList[] = all.filter(i => i.kind === "list")
    .map(i => ({ id: i.id, name: String(i.data.name ?? "List"), places: [] as SavedPlace[], created: Number(i.data.created) || 0 }))
    .sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
  const byId = new Map(lists.map(l => [l.id, l]));
  for (const i of all.filter(i => i.kind === "place")) {
    const d = i.data as Record<string, unknown>;
    const list = byId.get(String(d.listId));
    if (!list) continue;
    const { listId: _l, placeId, ...rest } = d;
    void _l;
    list.places.push({ id: String(placeId), ...(rest as Omit<SavedPlace, "id">) });
  }
  for (const l of lists) l.places.sort((a, b) => (b.added || 0) - (a.added || 0));

  const localB = new Map((localOnly?.visits ?? []).map(v => [v.visit, v.ratings.b]));
  const ratings = new Map<string, { a: number; b: number }>();
  for (const i of all.filter(i => i.kind === "rating")) {
    const visit = String(i.data.visit), stars = Number(i.data.stars) || 0;
    const r = ratings.get(visit) ?? { a: 0, b: 0 };
    if (i.owner && i.owner === people.me) r.a = stars;
    else if (i.owner && (people.partner ? i.owner === people.partner : true)) r.b = stars;
    ratings.set(visit, r);
  }
  const visits: Visit[] = all.filter(i => i.kind === "visit").map(i => {
    const d = i.data as Omit<Visit, "visit" | "ratings">;
    const r = ratings.get(i.id) ?? { a: 0, b: 0 };
    // Ratings entered for the partner on this phone (before they joined) stay until the partner rates it themselves.
    if (!r.b && localB.has(i.id)) r.b = localB.get(i.id) || 0;
    return { ...d, visit: i.id, ratings: r } as Visit;
  }).sort((a, b) => b.date - a.date);

  return { lists: lists.length ? lists : starterLists(), visits };
}

// ─── Comparing ───────────────────────────────────────────────────────────────

const stable = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v ?? null)
    : Array.isArray(v) ? `[${v.map(stable).join(",")}]`
    : `{${Object.keys(v as object).filter(k => (v as Record<string, unknown>)[k] !== undefined).sort()
        .map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;

/** Two items mean the same thing (a missing item and a deleted one are the same). */
export function same(a: Item | undefined, b: Item | undefined): boolean {
  const gone = (i?: Item) => !i || i.deleted;
  if (gone(a) || gone(b)) return gone(a) && gone(b);
  // Who wrote it only matters for ratings (each belongs to one person).
  return stable(a!.data) === stable(b!.data) && (a!.kind !== "rating" || (a!.owner ?? null) === (b!.owner ?? null));
}

/** What this phone needs to send: everything that differs from the shadow, except other people’s ratings. */
export function changesToPush(shadow: ItemMap, local: ItemMap, me: string | null): Item[] {
  const out: Item[] = [];
  for (const key of new Set([...Object.keys(shadow), ...Object.keys(local)])) {
    const s = shadow[key], l = local[key];
    if (same(s, l)) continue;
    const item = l ?? { ...s!, deleted: true };
    if (item.kind === "rating" && item.owner !== me) continue;
    out.push(l ? { ...l, deleted: false } : item);
  }
  return out;
}

/**
 * Takes what the server sent. Items not changed on this phone take the server’s version;
 * items changed here keep this phone’s version, which is sent up next.
 */
export function mergePulled(shadow: ItemMap, local: ItemMap, pulled: Item[], me: string | null = null): { shadow: ItemMap; local: ItemMap; changed: boolean } {
  const s2 = { ...shadow }, l2 = { ...local };
  let changed = false;
  for (const r of pulled) {
    const key = keyOf(r);
    // Someone else’s rating can’t be changed here, so theirs always wins.
    const theirs = r.kind === "rating" && r.owner !== me;
    const changedHere = !theirs && !same(shadow[key], local[key]);
    const clean: Item = { kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, owner: r.owner ?? null };
    if (r.deleted) delete s2[key]; else s2[key] = clean;
    if (changedHere) continue;
    if (!same(local[key], clean)) changed = true;
    if (r.deleted) delete l2[key]; else l2[key] = clean;
  }
  return { shadow: s2, local: l2, changed };
}

/** Pull a little before the last change seen, so changes saved at nearly the same moment aren’t missed. */
export function pullFrom(cursor: string | null, overlapMs = 5000): string | null {
  if (!cursor) return null;
  return new Date(new Date(cursor).getTime() - overlapMs).toISOString();
}

export const latest = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

export type { MoodId, Tags };
