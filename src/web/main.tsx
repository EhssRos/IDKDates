import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { migrate } from "../core/storage";
import { App } from "./App";
import { webStore } from "./platform";
import "./styles/app.css";

migrate(webStore);
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// Offline start screen and “Add to Home Screen” support, in the built app only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
