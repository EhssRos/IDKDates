import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Item, RemoteItem } from "../core/sync";
import { OfflineError, type Account, type SpaceInfo, type SyncBackend } from "../core/syncEngine";

/*
 * The cloud side, on Supabase (a hosted Postgres database with sign-in).
 * The tables, access rules and functions are in supabase/schema.sql.
 * supabase-js also works in React Native, so this file can move to the native app as it is.
 */

interface SpaceRow { space_id: string; invite_code: string; members: { user_id: string; display_name: string }[] | null }

const toSpace = (r: SpaceRow | null): SpaceInfo | null =>
  r ? { spaceId: r.space_id, inviteCode: r.invite_code, members: (r.members ?? []).map(m => ({ userId: m.user_id, name: m.display_name })) } : null;

/** Turns “couldn’t reach the server” into OfflineError, and database errors into readable ones. */
function fail(e: unknown): never {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg)) throw new OfflineError();
  throw new Error(msg);
}

export class SupabaseBackend implements SyncBackend {
  readonly configured = true;
  private db: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, {
      // The app uses the address hash for its screens, so don’t look for sign-in tokens there.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "idkdates:auth" }
    });
  }

  async account(): Promise<Account | null> {
    const { data } = await this.db.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? "" } : null;
  }

  async sendCode(email: string, returnTo?: string) {
    const { error } = await this.db.auth.signInWithOtp({ email, options: { shouldCreateUser: true, ...(returnTo ? { emailRedirectTo: returnTo } : {}) } }).catch(fail);
    if (error) fail(error);
  }

  async signInWithLink(accessToken: string, refreshToken: string): Promise<Account> {
    const { data, error } = await this.db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(fail);
    if (error || !data.user) fail(error ?? "Sign-in failed");
    return { id: data.user.id, email: data.user.email ?? "" };
  }

  async verifyCode(email: string, code: string): Promise<Account> {
    const { data, error } = await this.db.auth.verifyOtp({ email, token: code.trim(), type: "email" }).catch(fail);
    if (error || !data.user) fail(error ?? "Sign-in failed");
    return { id: data.user.id, email: data.user.email ?? email };
  }

  async signOut() { await this.db.auth.signOut({ scope: "local" }).catch(() => {}); }

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args).then(r => r, fail);
    if (error) fail(error);
    return data as T;
  }

  async mySpace() { return toSpace(await this.rpc<SpaceRow | null>("my_space")); }
  async createSpace(name: string) { return toSpace(await this.rpc<SpaceRow>("create_space", { display_name: name }))!; }
  async joinSpace(code: string, name: string) { return toSpace(await this.rpc<SpaceRow>("join_space", { code, display_name: name }))!; }
  async leaveSpace() { await this.rpc("leave_space"); }
  async setName(name: string) { await this.rpc("set_display_name", { display_name: name }); }
  async deleteAccount() { await this.rpc("delete_account"); await this.signOut(); }

  async pull(spaceId: string, since: string | null): Promise<RemoteItem[]> {
    const out: RemoteItem[] = [];
    let from = since;
    // Page through changes, oldest first.
    for (;;) {
      let q = this.db.from("items").select("kind,id,data,deleted,owner,updated_at").eq("space_id", spaceId)
        .order("updated_at", { ascending: true }).limit(1000);
      if (from) q = q.gt("updated_at", from);
      const { data, error } = await q.then(r => r, fail);
      if (error) fail(error);
      out.push(...(data as RemoteItem[]));
      if (!data || data.length < 1000) return out;
      from = (data[data.length - 1] as RemoteItem).updated_at;
    }
  }

  async push(spaceId: string, items: Item[]): Promise<RemoteItem[]> {
    const out: RemoteItem[] = [];
    for (let i = 0; i < items.length; i += 500) {
      const rows = items.slice(i, i + 500).map(it => ({
        space_id: spaceId, kind: it.kind, id: it.id, data: it.data, deleted: it.deleted,
        ...(it.kind === "rating" ? { owner: it.owner } : {})
      }));
      const { data, error } = await this.db.from("items").upsert(rows, { onConflict: "space_id,kind,id" })
        .select("kind,id,data,deleted,owner,updated_at").then(r => r, fail);
      if (error) fail(error);
      out.push(...(data as RemoteItem[]));
    }
    return out;
  }
}

/** When no Supabase project is set up, sharing is simply not offered. */
const unavailable = async (): Promise<never> => { throw new Error("Sharing isn’t set up"); };
export const notConfigured: SyncBackend = {
  configured: false,
  account: async () => null,
  sendCode: unavailable, verifyCode: unavailable, signInWithLink: unavailable, signOut: async () => {}, mySpace: async () => null,
  createSpace: unavailable, joinSpace: unavailable, leaveSpace: unavailable, setName: unavailable,
  deleteAccount: unavailable, pull: unavailable, push: unavailable
};
