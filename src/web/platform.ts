// Everything browser-specific the rest of the web app needs, in one place.
import type { KeyValueStore } from "../core/storage";
import { PlaceCache } from "../data/placeCache";

export const webStore: KeyValueStore = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, v),
  remove: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};

export const lang = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "en").slice(0, 2).toLowerCase();

export const placeCache = new PlaceCache(webStore);

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent);
