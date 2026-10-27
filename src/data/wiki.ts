import type { Tags } from "../core/types";
import { getJson } from "./http";

export interface Backstory { text: string; url?: string }

async function summary(lang: string, title: string, signal?: AbortSignal): Promise<Backstory | null> {
  try {
    const j = await getJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, 10000, signal);
    return j.extract ? { text: j.extract, url: j.content_urls?.desktop?.page } : null;
  } catch { return null; }
}

/** A short description from Wikipedia or Wikidata, when the place has an entry. */
export async function backstory(t: Tags, lang: string, signal?: AbortSignal): Promise<Backstory | null> {
  try {
    if (t.wikidata && /^Q\d+$/.test(t.wikidata)) {
      type Entity = { sitelinks?: Record<string, { title: string }>; descriptions?: Record<string, { value: string }> };
      const j = await getJson<{ entities?: Record<string, Entity> }>(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${t.wikidata}&props=sitelinks|descriptions&languages=${lang}|en&format=json&origin=*`, 10000, signal);
      const e = j.entities?.[t.wikidata];
      if (e) {
        for (const wl of [lang, "en"]) {
          const link = e.sitelinks?.[wl + "wiki"];
          if (link) { const s = await summary(wl, link.title, signal); if (s) return s; }
        }
        const d = e.descriptions?.[lang]?.value || e.descriptions?.en?.value;
        if (d) return { text: d.charAt(0).toUpperCase() + d.slice(1) + "." };
      }
    }
    if (t.wikipedia?.includes(":")) {
      const [wl, ...rest] = t.wikipedia.split(":");
      return await summary(wl, rest.join(":"), signal);
    }
  } catch { /* no backstory */ }
  return null;
}
