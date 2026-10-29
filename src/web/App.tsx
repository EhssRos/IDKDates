import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { loadHistory, loadLists, loadSettings, saveHistory, saveLists, saveSettings } from "../core/storage";
import type { PlaceList, Settings, Visit } from "../core/types";
import { PickView } from "./components/PickView";
import { SyncDot } from "./components/SyncDot";
import { Logo } from "./Logo";
import { useSharing } from "./useSharing";
import { webStore } from "./platform";
import { useHashView } from "./useHashView";

const TimelineView = lazy(() => import("./components/TimelineView"));
const AccountView = lazy(() => import("./components/AccountView"));
const ListsView = lazy(() => import("./components/ListsView"));

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(webStore));
  const [visits, setVisits] = useState<Visit[]>(() => loadHistory(webStore));
  const [lists, setLists] = useState<PlaceList[]>(() => loadLists(webStore));
  const [view, setView] = useHashView();
  // An invite link (#join=CODE) opens the account screen with the code ready.
  const [joinCode, setJoinCode] = useState<string | null>(() => (location.hash.startsWith("#join=") ? decodeURIComponent(location.hash.slice(6)) : null));
  useEffect(() => { if (joinCode) history.replaceState(null, "", "#account"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sharing = useSharing(lists, setLists, visits, setVisits, settings.nameA);

  useEffect(() => saveSettings(webStore, settings), [settings]);
  useEffect(() => saveHistory(webStore, visits), [visits]);
  useEffect(() => saveLists(webStore, lists), [lists]);
  useEffect(() => { document.body.dataset.ready = "1"; }, []);

  const update = useCallback((patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch })), []);
  const partner = sharing.partner;
  const names = partner
    ? { a: settings.nameA.trim() || "Me", b: partner.name || "Partner" }
    : { a: settings.nameA.trim() || "Me", b: settings.nameB.trim() || "You" };

  return (
    <main className="wrap">
      <header>
        <div className="top">
          <h1 style={{ margin: 0 }}><Logo /></h1>
          {sharing.configured && (
            <button type="button" className="account-btn" aria-pressed={view === "account"} onClick={() => setView("account")}>
              {sharing.account ? <><SyncDot status={sharing.status} /> {partner ? "Shared" : "Account"}</> : "Share"}
            </button>
          )}
        </div>
        <p className="tagline">You pick the mood. IDKDates picks the place.</p>
      </header>

      <nav className="seg views" id="views" aria-label="Sections">
        <button type="button" aria-pressed={view === "pick"} onClick={() => setView("pick")}>Pick</button>
        <button type="button" aria-pressed={view === "lists"} onClick={() => setView("lists")}>Lists</button>
        <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
      </nav>

      <div id="viewPick" hidden={view !== "pick"}>
        <PickView settings={settings} update={update} visits={visits} setVisits={setVisits} names={names} lists={lists} setLists={setLists}
          goToLists={() => setView("lists")} />
      </div>

      <section id="viewLists" aria-labelledby="h-lists" hidden={view !== "lists"}>
        <h2 className="tl-title" id="h-lists">Your lists</h2>
        {view === "lists" && (
          <Suspense fallback={null}>
            <ListsView lists={lists} setLists={setLists} settings={settings} update={update} />
          </Suspense>
        )}
      </section>

      <section id="viewAccount" aria-labelledby="h-account" hidden={view !== "account"}>
        <h2 className="tl-title" id="h-account">{partner ? "Shared with " + (partner.name || "your partner") : "Share with your partner"}</h2>
        {view === "account" && (
          <Suspense fallback={null}>
            <AccountView sharing={sharing} settings={settings} update={update} joinCode={joinCode} clearJoinCode={() => setJoinCode(null)} />
          </Suspense>
        )}
      </section>

      <section id="viewTimeline" aria-labelledby="h-tl" hidden={view !== "timeline"}>
        <h2 className="tl-title" id="h-tl">Your timeline</h2>
        {view === "timeline" && (
          <Suspense fallback={null}>
            <TimelineView visits={visits} setVisits={setVisits} names={names} lists={lists} setLists={setLists} partnerRatesThemselves={!!partner} />
          </Suspense>
        )}
      </section>

      <footer>
        <p>Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. Descriptions from Wikipedia where available.</p>
        <p>Travel times are estimates. Check opening hours before you head out.</p>
      </footer>
    </main>
  );
}
