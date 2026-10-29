import type { Item, RemoteItem } from "../../src/core/sync";
import { OfflineError, type Account, type SpaceInfo, type SyncBackend } from "../../src/core/syncEngine";

/** An in-memory stand-in for the Supabase database, with the same rules (see supabase/schema.sql). */
export class FakeServer {
  users = new Map<string, Account>();
  spaces = new Map<string, { code: string; members: { userId: string; name: string }[] }>();
  items = new Map<string, RemoteItem & { spaceId: string }>();
  offline = false;
  private clock = Date.parse("2026-10-24T17:00:00Z");
  private n = 0;
  tick() { return new Date(this.clock + ++this.n).toISOString(); }

  backendFor(): FakeBackend { return new FakeBackend(this); }
}

export class FakeBackend implements SyncBackend {
  configured = true;
  private user: Account | null = null;
  constructor(private server: FakeServer) {}
  private check() { if (this.server.offline) throw new OfflineError(); if (!this.user) throw new Error("not_signed_in"); return this.user; }
  private spaceOf(userId: string) { for (const [id, s] of this.server.spaces) if (s.members.some(m => m.userId === userId)) return id; return null; }
  private info(id: string): SpaceInfo { const s = this.server.spaces.get(id)!; return { spaceId: id, inviteCode: s.code, members: s.members.map(m => ({ ...m })) }; }

  async account() { return this.user; }
  async sendCode() { if (this.server.offline) throw new OfflineError(); }
  async verifyCode(email: string, code: string) {
    if (code !== "123456") throw new Error("Invalid code");
    let u = [...this.server.users.values()].find(x => x.email === email);
    if (!u) { u = { id: "user-" + email.split("@")[0], email }; this.server.users.set(u.id, u); }
    this.user = u;
    return u;
  }
  async signInWithLink(accessToken: string) {
    const u = this.server.users.get(accessToken);
    if (!u) throw new Error("Invalid link");
    this.user = u;
    return u;
  }
  async signOut() { this.user = null; }
  async mySpace() { const u = this.check(); const id = this.spaceOf(u.id); return id ? this.info(id) : null; }
  async createSpace(name: string) {
    const u = this.check();
    let id = this.spaceOf(u.id);
    if (!id) { id = "space-" + u.id; this.server.spaces.set(id, { code: ("C" + u.id).toUpperCase().slice(0, 8), members: [{ userId: u.id, name }] }); }
    return this.info(id);
  }
  async joinSpace(code: string, name: string) {
    const u = this.check();
    const id = [...this.server.spaces].find(([, s]) => s.code === code.toUpperCase())?.[0];
    if (!id) throw new Error("invite_not_found");
    const target = this.server.spaces.get(id)!;
    if (!target.members.some(m => m.userId === u.id)) {
      if (target.members.length >= 2) throw new Error("space_full");
      await this.leaveSpace();
      target.members.push({ userId: u.id, name });
    }
    return this.info(id);
  }
  async leaveSpace() {
    const u = this.check();
    for (const [id, s] of this.server.spaces) {
      s.members = s.members.filter(m => m.userId !== u.id);
      if (!s.members.length) this.server.spaces.delete(id);
    }
  }
  async setName(name: string) { const u = this.check(); for (const s of this.server.spaces.values()) for (const m of s.members) if (m.userId === u.id) m.name = name; }
  async deleteAccount() { const u = this.check(); await this.leaveSpace(); this.server.users.delete(u.id); this.user = null; }
  async pull(spaceId: string, since: string | null) {
    const u = this.check();
    if (this.spaceOf(u.id) !== spaceId) throw new Error("not a member");
    return [...this.server.items.values()].filter(i => i.spaceId === spaceId && (!since || i.updated_at > since))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at)).map(({ spaceId: _s, ...i }) => (void _s, structuredClone(i)));
  }
  async push(spaceId: string, items: Item[]) {
    const u = this.check();
    if (this.spaceOf(u.id) !== spaceId) throw new Error("not a member");
    const out: RemoteItem[] = [];
    for (const it of items) {
      const key = `${spaceId}|${it.kind}|${it.id}`;
      const existing = this.server.items.get(key);
      // Same rule as the database: ratings can only be written by their owner.
      if (it.kind === "rating" && (it.owner !== u.id || (existing && existing.owner !== u.id))) throw new Error("permission denied");
      const row = { ...structuredClone(it), owner: it.kind === "rating" ? u.id : (it.owner ?? u.id), updated_at: this.server.tick(), spaceId };
      this.server.items.set(key, row);
      const { spaceId: _s, ...rest } = row; void _s;
      out.push(rest);
    }
    return out;
  }
}
