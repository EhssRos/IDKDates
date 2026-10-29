// A stand-in for the Supabase project, answering the same requests supabase-js sends,
// with the same rules as supabase/schema.sql. Shared by every phone in a test.

export const SUPABASE_HOST = "supabase.test";
export const GOOD_CODE = "123456";

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = sub => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.${Buffer.from("fake-signature").toString("base64url")}`;

export class FakeSupabase {
  constructor() {
    this.users = new Map();     // email -> user
    this.tokens = new Map();    // access token -> user id
    this.spaces = new Map();    // id -> { code, members: [{ user_id, display_name }] }
    this.items = new Map();     // `${space}|${kind}|${id}` -> row
    this.codesSent = [];
    this.offline = false;
    this.clock = Date.parse("2026-10-24T17:00:00Z");
    this.n = 0;
  }
  userFor(email) {
    let u = this.users.get(email);
    if (!u) { u = { id: `00000000-0000-4000-8000-${String(this.users.size + 1).padStart(12, "0")}`, email }; this.users.set(email, u); }
    return u;
  }
  tokenFor(u) { const t = jwt(u.id); this.tokens.set(t, u.id); return t; }
  /** The address the sign-in link in the email leads to, as Supabase builds it. */
  signInLink(email, base = "http://localhost:4173/") {
    const token = this.tokenFor(this.userFor(email));
    return `${this.lastRedirect || base}#access_token=${token}&expires_at=4102444800&expires_in=3600&refresh_token=r-x&token_type=bearer&type=magiclink`;
  }
  tick() { return new Date(this.clock + ++this.n).toISOString(); }
  spaceOf(uid) { for (const [id, s] of this.spaces) if (s.members.some(m => m.user_id === uid)) return id; return null; }
  info(id) { if (!id) return null; const s = this.spaces.get(id); return { space_id: id, invite_code: s.code, members: s.members.map(m => ({ ...m })) }; }
  leave(uid) { for (const [id, s] of this.spaces) { s.members = s.members.filter(m => m.user_id !== uid); if (!s.members.length) this.spaces.delete(id); } }

  async handle(route) {
    if (this.offline) return route.abort("internetdisconnected");
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const fail = (message, status = 400) => json({ code: "P0001", message, details: null, hint: null }, status);
    const uid = this.tokens.get((req.headers()["authorization"] || "").replace(/^Bearer /, ""));

    // ── Sign-in ──
    if (path === "/auth/v1/otp") {
      this.codesSent.push(body.email);
      this.lastRedirect = url.searchParams.get("redirect_to");
      return json({});
    }
    if (path === "/auth/v1/verify") {
      if (body.token !== GOOD_CODE) return json({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }, 403);
      const u = this.userFor(body.email);
      const token = this.tokenFor(u);
      return json({ access_token: token, token_type: "bearer", expires_in: 3600, refresh_token: "r-" + u.id,
        user: { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } });
    }
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (path === "/auth/v1/user") {
      const u = [...this.users.values()].find(x => x.id === uid);
      return u ? json({ id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} }) : json({ msg: "invalid" }, 401);
    }

    if (!uid) return fail("not_signed_in", 401);

    // ── Functions ──
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.slice("/rest/v1/rpc/".length);
      if (fn === "my_space") return json(this.info(this.spaceOf(uid)));
      if (fn === "create_space") {
        let id = this.spaceOf(uid);
        if (!id) { id = "space-" + (this.spaces.size + 1) + "-" + uid.slice(-4); this.spaces.set(id, { code: ("JOIN" + uid.slice(-4)).toUpperCase(), members: [{ user_id: uid, display_name: body?.display_name ?? "" }] }); }
        return json(this.info(id));
      }
      if (fn === "join_space") {
        const id = [...this.spaces].find(([, s]) => s.code === String(body.code).trim().toUpperCase())?.[0];
        if (!id) return fail("invite_not_found");
        const s = this.spaces.get(id);
        if (!s.members.some(m => m.user_id === uid)) {
          if (s.members.length >= 2) return fail("space_full");
          this.leave(uid);
          s.members.push({ user_id: uid, display_name: body.display_name ?? "" });
        }
        return json(this.info(id));
      }
      if (fn === "leave_space") { this.leave(uid); return route.fulfill({ status: 204 }); }
      if (fn === "set_display_name") { for (const s of this.spaces.values()) for (const m of s.members) if (m.user_id === uid) m.display_name = body.display_name; return route.fulfill({ status: 204 }); }
      if (fn === "delete_account") {
        for (const [k, r] of this.items) if (r.kind === "rating" && r.owner === uid) this.items.delete(k);
        this.leave(uid);
        for (const [e, u] of this.users) if (u.id === uid) this.users.delete(e);
        return route.fulfill({ status: 204 });
      }
      return fail("unknown function " + fn, 404);
    }

    // ── Items ──
    if (path === "/rest/v1/items") {
      const pick = r => ({ kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, owner: r.owner, updated_at: r.updated_at });
      if (req.method() === "GET") {
        const space = (url.searchParams.get("space_id") || "").replace(/^eq\./, "");
        const since = (url.searchParams.get("updated_at") || "").replace(/^gt\./, "");
        if (this.spaceOf(uid) !== space) return json([]); // what row-level security does: you just see nothing
        const rows = [...this.items.values()].filter(r => r.space_id === space && (!since || r.updated_at > since))
          .sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, Number(url.searchParams.get("limit") || 1000));
        return json(rows.map(pick));
      }
      if (req.method() === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        const out = [];
        for (const r of rows) {
          if (this.spaceOf(uid) !== r.space_id) return fail("new row violates row-level security policy", 403);
          const key = `${r.space_id}|${r.kind}|${r.id}`;
          const existing = this.items.get(key);
          const owner = r.kind === "rating" ? r.owner : uid;
          if (r.kind === "rating" && (owner !== uid || (existing && existing.owner !== uid))) return fail("new row violates row-level security policy", 403);
          const row = { space_id: r.space_id, kind: r.kind, id: r.id, data: r.data, deleted: !!r.deleted, owner, updated_at: this.tick() };
          this.items.set(key, row);
          out.push(pick(row));
        }
        return json(out, 201);
      }
    }
    return fail("not found: " + path, 404);
  }
}
