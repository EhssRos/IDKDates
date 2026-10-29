import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SyncEngine, type Account } from "../core/syncEngine";
import type { PlaceList, Visit } from "../core/types";
import { backend, webStore } from "./platform";
import { readSignInLink, savePending, takePending, takeSignInLink, type LinkResult } from "./signInLink";

/** How long after a change to wait before syncing, so a burst of edits goes up together. */
const DEBOUNCE_MS = 1500;
/** How often to check for the partner’s changes while the app is open. */
const POLL_MS = 20000;

/**
 * Sign-in, the shared space and syncing, for the web app. The rules live in core/sync.ts and
 * core/syncEngine.ts; this hook decides when to sync: on start, shortly after changes, every
 * 20 seconds while open, and when the app comes back to the foreground or online.
 */
export function useSharing(
  lists: PlaceList[], setLists: (l: PlaceList[]) => void,
  visits: Visit[], setVisits: (v: Visit[]) => void,
  myName: string
) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const latest = useRef({ lists, visits });
  latest.current = { lists, visits };
  const fromSync = useRef(false);

  const engine = useMemo(() => new SyncEngine(backend, webStore, {
    read: () => latest.current,
    write: (l, v) => { fromSync.current = true; latest.current = { lists: l, visits: v }; setLists(l); setVisits(v); }
  }, rerender), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(!backend.configured);
  const [linkError, setLinkError] = useState("");

  // Finish a sign-in from the email link: the app was opened by the link, or the link landed in an open tab.
  const finishLinkSignIn = useCallback((link: LinkResult, live: () => boolean) => {
    if (link.kind === "error") { setLinkError(link.message); setReady(true); return; }
    const pending = takePending();
    backend.signInWithLink(link.accessToken, link.refreshToken)
      .then(async a => { if (live()) { setReady(true); await signedInRef.current(a, pending?.joinCode ?? null); } })
      .catch(() => { if (live()) setLinkError("That sign-in link didn’t work. Send yourself a new one."); })
      .finally(() => { if (live()) setReady(true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!backend.configured) return;
    let live = true;
    const onHash = () => {
      const link = readSignInLink(location.hash);
      if (!link) return;
      history.replaceState(null, "", location.pathname + location.search + "#account");
      dispatchEvent(new HashChangeEvent("hashchange"));
      finishLinkSignIn(link, () => live);
    };
    addEventListener("hashchange", onHash);
    return () => { live = false; removeEventListener("hashchange", onHash); };
  }, [finishLinkSignIn]);

  // On start: finish a sign-in from the email link, or see who’s signed in, and catch up.
  useEffect(() => {
    if (!backend.configured) return;
    let live = true;
    const link = takeSignInLink();
    if (link) {
      finishLinkSignIn(link, () => live);
      return () => { live = false; };
    }
    backend.account().then(async a => {
      if (!live) return;
      setAccount(a);
      setReady(true);
      if (!a) { if (engine.active) engine.detach(); return; }
      if (!engine.active) {
        const space = await backend.mySpace().catch(() => null);
        if (space) engine.attach(a.id, space);
      }
      void engine.syncNow();
    }).catch(() => setReady(true));
    return () => { live = false; };
  }, [engine, finishLinkSignIn]);

  // Shortly after a change made on this phone.
  useEffect(() => {
    if (fromSync.current) { fromSync.current = false; return; }
    if (!engine.active) return;
    const t = setTimeout(() => void engine.syncNow(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [lists, visits, engine]);

  // Regularly while open, and when coming back.
  useEffect(() => {
    if (!backend.configured) return;
    const sync = () => { if (engine.active && document.visibilityState === "visible") void engine.syncNow(); };
    const t = setInterval(sync, POLL_MS);
    addEventListener("focus", sync);
    addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(t); removeEventListener("focus", sync); removeEventListener("online", sync); document.removeEventListener("visibilitychange", sync); };
  }, [engine]);

  const signedIn = useCallback(async (a: Account, joinCode: string | null) => {
    setAccount(a);
    const name = myName.trim() || a.email.split("@")[0];
    const space = joinCode ? await backend.joinSpace(joinCode, name) : (await backend.mySpace()) ?? (await backend.createSpace(name));
    engine.attach(a.id, space);
    await engine.syncNow();
  }, [engine, myName]);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  return {
    configured: backend.configured,
    ready,
    account,
    engine,
    status: engine.status,
    space: engine.spaceInfo,
    partner: engine.partner,
    linkError,
    sendCode: (email: string, joinCode: string | null) => {
      savePending({ email, joinCode });
      setLinkError("");
      return backend.sendCode(email, location.origin + location.pathname);
    },
    verifyCode: async (email: string, code: string, joinCode: string | null) => signedIn(await backend.verifyCode(email, code), joinCode),
    join: async (code: string) => {
      if (!account) return;
      engine.attach(account.id, await backend.joinSpace(code, myName.trim() || account.email.split("@")[0]));
      await engine.syncNow();
    },
    /** Stop sharing with the partner; keeps everything here and continues in a space of your own. */
    leave: async () => {
      if (!account) return;
      await backend.leaveSpace();
      engine.detach();
      engine.attach(account.id, await backend.createSpace(myName.trim() || account.email.split("@")[0]));
      await engine.syncNow();
    },
    setName: async (name: string) => { await backend.setName(name); await engine.syncNow(); },
    syncNow: () => engine.syncNow(),
    signOut: async () => { engine.detach(); await backend.signOut(); setAccount(null); },
    deleteAccount: async () => { await backend.deleteAccount(); engine.detach(); setAccount(null); }
  };
}

export type Sharing = ReturnType<typeof useSharing>;
