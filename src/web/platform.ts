// Everything browser-specific the rest of the web app needs, in one place.
import type { KeyValueStore } from "../core/storage";
import type { SyncBackend } from "../core/syncEngine";
import { PlaceCache } from "../data/placeCache";
import { notConfigured, SupabaseBackend } from "../data/supabaseBackend";

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

/** Sharing works when the build knows a Supabase project (see README: “Sharing between phones”). */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const backend: SyncBackend = url && key ? new SupabaseBackend(url, key) : notConfigured;
