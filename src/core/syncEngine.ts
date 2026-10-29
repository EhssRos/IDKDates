import type { KeyValueStore } from "./storage";
import { changesToPush, flatten, keyOf, latest, mergePulled, pullFrom, unflatten, type Item, type ItemMap, type People, type RemoteItem } from "./sync";
import type { PlaceList, Visit } from "./types";

export interface Account { id: string; email: string }
export interface Member { userId: string; name: string }
export interface SpaceInfo { spaceId: string; inviteCode: string; members: Member[] }

/** The cloud side, as the app needs it. Implemented with Supabase in src/data, and faked in tests. */
export interface SyncBackend {
  readonly configured: boolean;
  account(): Promise<Account | null>;
  /** Emails a sign-in link (and a code, if the email template includes one). The link leads back to `returnTo`. */
  sendCode(email: string, returnTo?: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<Account>;
  /** Finishes a sign-in from the link in the email, with the tokens it brought back. */
  signInWithLink(accessToken: string, refreshToken: string): Promise<Account>;
  signOut(): Promise<void>;
  mySpace(): Promise<SpaceInfo | null>;
  createSpace(name: string): Promise<SpaceInfo>;
  joinSpace(code: string, name: string): Promise<SpaceInfo>;
  leaveSpace(): Promise<void>;
  setName(name: string): Promise<void>;
  deleteAccount(): Promise<void>;
  /** Items changed since a server time (or all of them). */
  pull(spaceId: string, since: string | null): Promise<RemoteItem[]>;
  /** Saves items and returns them as stored. */
  push(spaceId: string, items: Item[]): Promise<RemoteItem[]>;
}

/** Thrown by backends when the network is down, so the app can say “offline” instead of “error”. */
export class OfflineError extends Error { constructor() { super("offline"); this.name = "OfflineError"; } }

export type SyncStatus =
  | { kind: "off" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  | { kind: "offline" }
  | { kind: "error"; message: string };

interface Saved { userId: string; spaceId: string; cursor: string | null; shadow: ItemMap }

export interface LocalData {
  read(): { lists: PlaceList[]; visits: Visit[] };
  write(lists: PlaceList[], visits: Visit[]): void;
}

const KEY = "idkdates:v1:sync";

/** Keeps this phone and the shared space in step. Platform-free; the app decides when to call syncNow(). */
export class SyncEngine {
  private saved: Saved | null = null;
  private space: SpaceInfo | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  status: SyncStatus = { kind: "off" };

  constructor(
    private backend: SyncBackend,
    private store: KeyValueStore,
    private local: LocalData,
    private onChange: () => void = () => {}
  ) {
    try { const raw = store.get(KEY); if (raw) this.saved = JSON.parse(raw); } catch { this.saved = null; }
  }

  get spaceInfo() { return this.space; }
  get people(): People {
    const me = this.saved?.userId ?? null;
    return { me, partner: this.space?.members.find(m => m.userId !== me)?.userId ?? null };
  }
  get partner(): Member | null { return this.space?.members.find(m => m.userId !== this.saved?.userId) ?? null; }
  get active() { return !!this.saved; }

  /** Starts syncing a space. Joining a different space starts fresh: everything here is sent up and merged. */
  attach(userId: string, space: SpaceInfo) {
    this.space = space;
    if (!this.saved || this.saved.spaceId !== space.spaceId || this.saved.userId !== userId) {
      this.saved = { userId, spaceId: space.spaceId, cursor: null, shadow: {} };
      this.persist();
    }
    this.onChange();
  }

  /** Stops syncing. Everything stays on this phone. */
  detach() {
    this.saved = null;
    this.space = null;
    try { this.store.remove(KEY); } catch { /* ignore */ }
    this.setStatus({ kind: "off" });
  }

  /** Runs one sync; if one is already running, runs another right after it. */
  syncNow(): Promise<void> {
    if (!this.saved) return Promise.resolve();
    if (this.running) { this.again = true; return this.running; }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; void this.syncNow(); }
    });
    return this.running;
  }

  private async run() {
    const s = this.saved!;
    this.setStatus({ kind: "syncing" });
    try {
      const space = await this.backend.mySpace();
      if (!this.saved || this.saved !== s) return;
      if (!space || space.spaceId !== s.spaceId) {
        // Left or removed elsewhere: stop, keep everything here.
        this.detach();
        return;
      }
      this.space = space;
      const people = this.people;

      const pulled = await this.backend.pull(s.spaceId, pullFrom(s.cursor));
      if (this.saved !== s) return;
      let cursor = s.cursor;
      for (const r of pulled) cursor = latest(cursor, r.updated_at);

      const current = this.local.read();
      const merged = mergePulled(s.shadow, flatten(current.lists, current.visits, people), pulled, people.me);
      if (merged.changed) {
        const next = unflatten(merged.local, people, current);
        this.local.write(next.lists, next.visits);
      }
      s.shadow = merged.shadow;

      const toPush = changesToPush(merged.shadow, merged.local, people.me);
      if (toPush.length) {
        const stored = await this.backend.push(s.spaceId, toPush);
        if (this.saved !== s) return;
        for (const r of stored) {
          cursor = latest(cursor, r.updated_at);
          if (r.deleted) delete s.shadow[keyOf(r)];
          else s.shadow[keyOf(r)] = { kind: r.kind, id: r.id, data: r.data, deleted: false, owner: r.owner ?? null };
        }
      }
      s.cursor = cursor;
      this.persist();
      this.setStatus({ kind: "synced", at: Date.now() });
    } catch (e) {
      this.setStatus(e instanceof OfflineError ? { kind: "offline" } : { kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  private persist() {
    try { if (this.saved) this.store.set(KEY, JSON.stringify(this.saved)); } catch { /* storage full: sync still works this session */ }
  }
  private setStatus(st: SyncStatus) { this.status = st; this.onChange(); }
}
