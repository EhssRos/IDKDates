import type { Tags } from "./types";

const KIND: Record<string, string> = {
  restaurant: "Restaurant", fast_food: "Quick bite", ice_cream: "Ice cream", cafe: "Café", bar: "Bar", pub: "Pub", biergarten: "Beer garden",
  nightclub: "Club", music_venue: "Live music venue",
  bowling_alley: "Bowling", escape_game: "Escape room", amusement_arcade: "Arcade", miniature_golf: "Mini golf", trampoline_park: "Trampoline park",
  water_park: "Water park", ice_rink: "Ice rink", cinema: "Cinema", theme_park: "Theme park",
  park: "Park", nature_reserve: "Nature reserve", garden: "Garden", viewpoint: "Viewpoint", picnic_site: "Picnic spot", peak: "Peak", beach: "Beach",
  waterfall: "Waterfall", water: "Lake",
  museum: "Museum", gallery: "Gallery", zoo: "Zoo", aquarium: "Aquarium", theatre: "Theatre", arts_centre: "Arts centre",
  castle: "Castle", ruins: "Ruins", monument: "Monument", fort: "Fort", city_gate: "City gate", manor: "Manor house"
};
const SPORT: Record<string, string> = { climbing: "Climbing", karting: "Go-karts", laser_tag: "Laser tag", paintball: "Paintball", bowling: "Bowling", "10pin": "Bowling" };

const prettify = (v: string) => v.split(";")[0].replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

/** A friendly name for what kind of place this is. */
export function kindOf(t: Tags): string {
  for (const key of ["amenity", "leisure", "tourism", "natural", "historic", "waterway"]) {
    const value = t[key];
    const base = value ? KIND[value] : undefined;
    if (!base) continue;
    if (t.cuisine && (value === "restaurant" || value === "fast_food")) {
      const c = prettify(t.cuisine);
      return value === "restaurant" ? `${c} restaurant` : `${c}, quick bite`;
    }
    return base;
  }
  const s = t.sport && SPORT[t.sport.split(";")[0]];
  return s || "Somewhere new";
}

/** One readable sentence from the facts the map knows, or "" if it knows none. */
export function factsSentence(t: Tags, kind: string): string {
  const f: string[] = [];
  if (t.outdoor_seating === "yes") f.push("outdoor seating");
  if (t["diet:vegan"] === "yes" || t["diet:vegan"] === "only") f.push(t["diet:vegan"] === "only" ? "a fully vegan menu" : "vegan options");
  else if (t["diet:vegetarian"] === "yes" || t["diet:vegetarian"] === "only") f.push("vegetarian options");
  if (t.fee === "no") f.push("free entry");
  if (t.ele && /^\d+/.test(t.ele)) f.push(`an elevation of ${parseInt(t.ele, 10).toLocaleString("en-US")} m`);
  if (t.wheelchair === "yes") f.push("step-free access");
  if (t.dog === "yes") f.push("dogs welcome");
  if (!f.length) return "";
  const list = f.length === 1 ? f[0] : f.slice(0, -1).join(", ") + " and " + f[f.length - 1];
  return `${kind} with ${list}.`;
}

export function address(t: Tags): string {
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const city = t["addr:city"] || t["addr:suburb"] || "";
  return [street, city].filter(Boolean).join(", ");
}

/** Opening hours as people write them, one rule per line. */
export function hoursText(h: string | undefined): string {
  if (!h) return "";
  if (h.trim() === "24/7") return "Open 24/7";
  return h.split(";").map(s => s.trim()).filter(Boolean).join("\n")
    .replace(/\bMo\b/g, "Mon").replace(/\bTu\b/g, "Tue").replace(/\bWe\b/g, "Wed").replace(/\bTh\b/g, "Thu")
    .replace(/\bFr\b/g, "Fri").replace(/\bSa\b/g, "Sat").replace(/\bSu\b/g, "Sun").replace(/\bPH\b/g, "Holidays")
    .replace(/\boff\b/g, "closed");
}

/** Shortens text at a sentence end if one is near, otherwise at a word, adding “…” only when cut mid-sentence. */
export function trimText(s: string, n = 320): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  if (end > 120) return cut.slice(0, end + 1);
  const words = cut.replace(/\s+\S*$/, "");
  return /[.!?]$/.test(words) ? words : words.replace(/[,;:]$/, "") + "…";
}
