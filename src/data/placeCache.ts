import type { KeyValueStore } from "../core/storage";
import type { Place } from "../core/types";

interface Entry { at: number; places: Place[] }

/**
 * Remembers map results for a while, across visits, so the same search
 * doesn't hit the map server again. Old and excess entries are dropped.
 */
export class PlaceCache {
  private entries: Record<string, Entry>;
  constructor(
    private store: KeyValueStore | null,
    private ttlMs = 24 * 3600000,
    private maxEntries = 12,
    private key = "idkdates:v1:places",
    private now: () => number = Date.now
  ) {
    this.entries = {};
    try {
      const raw = store?.get(key);
      if (raw) this.entries = JSON.parse(raw);
    } catch { this.entries = {}; }
  }
  get(query: string): Place[] | null {
    const e = this.entries[query];
    if (!e) return null;
    if (this.now() - e.at > this.ttlMs) { delete this.entries[query]; this.persist(); return null; }
    return e.places;
  }
  set(query: string, places: Place[]): void {
    this.entries[query] = { at: this.now(), places };
    const keys = Object.keys(this.entries).sort((a, b) => this.entries[b].at - this.entries[a].at);
    for (const k of keys.slice(this.maxEntries)) delete this.entries[k];
    this.persist();
  }
  clear(): void { this.entries = {}; this.persist(); }
  private persist() {
    try { this.store?.set(this.key, JSON.stringify(this.entries)); }
    catch { /* storage full: drop the persisted copy, keep the in-memory one */ try { this.store?.remove(this.key); } catch { /* ignore */ } }
  }
}
