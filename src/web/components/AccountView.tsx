import { useState } from "react";
import type { Settings } from "../../core/types";
import type { Sharing } from "../useSharing";
import { SyncDot } from "./SyncDot";

interface Props {
  sharing: Sharing;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Invite code from a link someone opened, if any. */
  joinCode: string | null;
  clearJoinCode: () => void;
}

const friendly = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (/offline/i.test(m)) return "You seem to be offline. Try again when you’re connected.";
  if (/invite_not_found/.test(m)) return "That invite code doesn’t exist. Check it with your partner.";
  if (/space_full/.test(m)) return "That shared space already has two people in it.";
  if (/expired|invalid|token/i.test(m)) return "That code didn’t work. Check it, or send a new one.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  return "Something went wrong: " + m;
};

/** Signing in, inviting your partner and managing the shared space. */
export default function AccountView({ sharing, settings, update, joinCode, clearJoinCode }: Props) {
  if (!sharing.configured) {
    return <p className="tl-sum">Sharing between phones isn’t set up for this copy of the app yet. Everything is saved on this phone.</p>;
  }
  if (!sharing.ready) return <p className="tl-sum">One moment…</p>;
  return sharing.account
    ? <SignedIn sharing={sharing} settings={settings} update={update} joinCode={joinCode} clearJoinCode={clearJoinCode} />
    : <SignIn sharing={sharing} settings={settings} update={update} joinCode={joinCode} />;
}

function SignIn({ sharing, settings, update, joinCode }: Omit<Props, "clearJoinCode">) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg("That doesn’t look like an email address."); return; }
    setBusy(true); setMsg("");
    try { await sharing.sendCode(email.trim(), joinCode); setStep("code"); }
    catch (e) { setMsg(friendly(e)); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setMsg("");
    try { await sharing.verifyCode(email.trim(), code, joinCode); }
    catch (e) { setMsg(friendly(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <p className="tl-sum">
        {joinCode
          ? "You’ve been invited to share lists and a timeline. Sign in to join."
          : "Share your lists and timeline with your partner, and keep them safe if you change phones."}
      </p>
      <section className="list-panel account-panel">
        <label className="acc-label">Your first name
          <input type="text" maxLength={20} value={settings.nameA} placeholder="So your partner knows who rated what"
            onChange={e => update({ nameA: e.target.value })} />
        </label>
        {step === "email" ? <>
          <label className="acc-label">Your email
            <input type="email" autoComplete="email" inputMode="email" value={email} placeholder="you@example.com"
              onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} />
          </label>
          <button type="button" className="go" disabled={busy} onClick={send}>Email me a sign-in link</button>
          <p className="hint">No password. We email you a link each time you sign in on a new phone.</p>
        </> : <>
          <p className="acc-sent">We sent an email to <strong>{email}</strong>. Open it on this phone and tap <strong>Sign in</strong>.</p>
          <p className="hint">If the email shows a code instead, enter it here:</p>
          <label className="acc-label">Code from the email
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => { if (e.key === "Enter") verify(); }} />
          </label>
          <button type="button" className="go" disabled={busy || code.length < 6} onClick={verify}>{joinCode ? "Sign in and join" : "Sign in"}</button>
          <button type="button" className="btn-link" onClick={() => { setStep("email"); setCode(""); }}>Use another email</button>
        </>}
        <p className="form-msg" role="alert">{msg || sharing.linkError}</p>
        <p className="hint">Until you sign in, everything stays only on this phone. After that, your lists, timeline and ratings are saved to your account.</p>
      </section>
    </>
  );
}

function SignedIn({ sharing, settings, update, joinCode, clearJoinCode }: Props) {
  const [confirm, setConfirm] = useState<null | "leave" | "delete" | "join">(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const space = sharing.space, partner = sharing.partner;
  const link = space ? `${location.origin}${location.pathname}#join=${space.inviteCode}` : "";

  const act = async (f: () => Promise<void>, done?: string) => {
    setMsg("");
    try { await f(); if (done) setMsg(done); } catch (e) { setMsg(friendly(e)); }
    setConfirm(null);
  };
  const share = async () => {
    const text = "Let’s share our IDKDates lists and timeline:";
    if (navigator.share) { try { await navigator.share({ title: "IDKDates", text, url: link }); return; } catch { /* closed */ } }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setMsg("Copy the link below by hand."); }
  };

  return (
    <>
      <p className="tl-sum">
        {partner
          ? `You and ${partner.name || "your partner"} share your lists, timeline and ratings.`
          : "Signed in. Invite your partner to share your lists, timeline and ratings."}
      </p>

      {joinCode && space && joinCode.toUpperCase() !== space.inviteCode && (
        <section className="list-panel account-panel">
          <h3 className="acc-h">You’ve been invited</h3>
          <p>{partner ? `Joining means leaving the space you share with ${partner.name}. Your lists and timeline come along and are merged.` : "Your lists and timeline come along and are merged with theirs."}</p>
          <div className="tl-actions">
            <button type="button" className="btn" onClick={() => (confirm === "join" || !partner ? act(async () => { await sharing.join(joinCode); clearJoinCode(); }, "Joined.") : setConfirm("join"))}>
              {confirm === "join" ? "Tap again to join" : "Join"}
            </button>
            <button type="button" className="btn-link" onClick={clearJoinCode}>Not now</button>
          </div>
        </section>
      )}

      {!partner && space && (
        <section className="list-panel account-panel">
          <h3 className="acc-h">Invite your partner</h3>
          <p>Send them this link. When they open it and sign in, you share everything.</p>
          <div className="tl-actions"><button type="button" className="go" onClick={share}>{copied ? "Link copied" : "Share invite link"}</button></div>
          <p className="invite-link" id="inviteLink">{link}</p>
          <p className="hint">Or they enter the code <strong id="inviteCode">{space.inviteCode}</strong> after signing in.</p>
          <JoinByCode onJoin={code => act(() => sharing.join(code), "Joined.")} />
        </section>
      )}

      <section className="list-panel account-panel">
        <p className="sync-line" id="syncStatus" role="status"><SyncDot status={sharing.status} /> {statusText(sharing.status)}</p>
        <label className="acc-label">Your first name
          <input type="text" maxLength={20} value={settings.nameA} onChange={e => update({ nameA: e.target.value })}
            onBlur={() => act(() => sharing.setName(settings.nameA.trim()))} />
        </label>
        <p className="hint">Signed in as {sharing.account!.email}.</p>
        <div className="tl-actions">
          <button type="button" className="btn" onClick={() => act(() => sharing.syncNow())}>Sync now</button>
          {partner && <button type="button" className="btn danger" onClick={() => (confirm === "leave" ? act(() => sharing.leave(), "You’ve stopped sharing. Everything is still on this phone.") : setConfirm("leave"))}>
            {confirm === "leave" ? "Tap again to stop sharing" : "Stop sharing"}</button>}
          <button type="button" className="btn" onClick={() => act(() => sharing.signOut(), "Signed out. Everything is still on this phone.")}>Sign out</button>
        </div>
        <div className="tl-actions">
          <button type="button" className="btn-link danger" onClick={() => (confirm === "delete" ? act(() => sharing.deleteAccount(), "Your account is deleted. Everything is still on this phone.") : setConfirm("delete"))}>
            {confirm === "delete" ? "Tap again to delete your account" : "Delete my account"}</button>
        </div>
        <p className="form-msg" role="alert">{msg}</p>
      </section>
    </>
  );
}

function JoinByCode({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="field name-field">
      <input type="text" aria-label="Partner’s invite code" placeholder="Have a code from your partner?" maxLength={8} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} />
      <button type="button" className="btn" disabled={code.length < 6} onClick={() => onJoin(code)}>Join</button>
    </div>
  );
}

function statusText(s: Sharing["status"]): string {
  switch (s.kind) {
    case "off": return "Not syncing";
    case "syncing": return "Syncing…";
    case "synced": return "Synced";
    case "offline": return "Offline. Changes are saved here and sync when you’re back.";
    case "error": return `Couldn’t sync: ${s.message}`;
  }
}

