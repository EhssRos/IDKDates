import { useCallback, useEffect, useState } from "react";

export type View = "pick" | "lists" | "timeline";
const VIEWS: View[] = ["pick", "lists", "timeline"];
const read = (): View => VIEWS.find(v => location.hash === "#" + v) ?? "pick";

/** The current screen, kept in the address (#pick, #lists or #timeline) so it survives a reload and can be linked. */
export function useHashView(): [View, (v: View) => void] {
  const [view, setViewState] = useState<View>(read);
  useEffect(() => {
    const onHash = () => setViewState(read());
    addEventListener("hashchange", onHash);
    if (location.hash !== "#" + read()) history.replaceState(null, "", "#" + read());
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    try { history.replaceState(null, "", "#" + v); } catch { /* ignore */ }
  }, []);
  return [view, setView];
}
