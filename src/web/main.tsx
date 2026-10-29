import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { migrate } from "../core/storage";
import { loadHoursLib } from "../data/hoursLib";
import { App } from "./App";
import { webStore } from "./platform";
import { captureSignInLink } from "./signInLink";
import "./styles/app.css";

migrate(webStore);
// A sign-in link from the email puts its result in the address; take it before the screens read the address.
captureSignInLink();
// Warm up the opening hours engine while people are still choosing, so picking never waits for it.
const warmUp = () => void loadHoursLib();
if ("requestIdleCallback" in window) requestIdleCallback(warmUp, { timeout: 3000 }); else setTimeout(warmUp, 1500);
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// Offline start screen and “Add to Home Screen” support, in the built app only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
