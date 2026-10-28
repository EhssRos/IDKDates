import type { Tags } from "./types";

const KIND: Record<string, string> = {
  restaurant: "Restaurant", fast_food: "Quick bite", ice_cream: "Ice cream", cafe: "Café", bar: "Bar", pub: "Pub", biergarten: "Beer garden",
  nightclub: "Club", music_venue: "Live music venue",
  bowling_alley: "Bowling", escape_game: "Escape room", amusement_arcade: "Arcade", miniature_golf: "Mini golf", trampoline_park: "Trampoline park",
  water_park: "Water park", ice_rink: "Ice rink", cinema: "Cinema", theme_park: "Theme park",
  park: "Park", nature_reserve: "Nature reserve", garden: "Garden", viewpoint: "Viewpoint", picnic_site: "Picnic spot", peak: "Peak", beach: "Beach",
  waterfall: "Waterfall", water: "Lake", swimming_area: "Swimming spot", hill: "Hill", forest: "Forest", wood: "Woods",
  national_park: "National park", protected_area: "Nature reserve", public_bath: "Public bath", food_court: "Food court",
  concert_hall: "Concert hall", palace: "Palace", monastery: "Monastery", archaeological_site: "Archaeological site",
  citywalls: "City walls", castle_wall: "Castle walls", tower: "Historic tower", battlefield: "Battlefield", aqueduct: "Aqueduct",
  memorial: "Memorial", building: "Historic building", church: "Historic church", ship: "Historic ship", attraction: "Sight",
  museum: "Museum", gallery: "Gallery", zoo: "Zoo", aquarium: "Aquarium", theatre: "Theatre", arts_centre: "Arts centre",
  castle: "Castle", ruins: "Ruins", monument: "Monument", fort: "Fort", city_gate: "City gate", manor: "Manor house"
};
const SPORT: Record<string, string> = { climbing: "Climbing", bouldering: "Bouldering", karting: "Go-karts", laser_tag: "Laser tag", paintball: "Paintball", bowling: "Bowling", "10pin": "Bowling", "9pin": "Bowling", swimming: "Swimming pool" };

const prettify = (v: string) => v.split(";")[0].replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

/** A friendly name for what kind of place this is. */
export function kindOf(t: Tags): string {
  if (t.leisure === "garden" && /^(botanical|arboretum)$/.test(t["garden:type"] || "")) return "Botanical garden";
  if (t.boundary === "national_park" || (t.boundary === "protected_area" && t.protect_class === "2")) return "National park";
  if (t.leisure === "sports_centre" && t.sport) {
    const s = SPORT[t.sport.split(";")[0]];
    if (s) return s;
  }
  // “Sight” is the vaguest description, so anything more specific wins.
  const tourism = t.tourism === "attraction" ? undefined : t.tourism;
  const candidates = [t.amenity, t.leisure, tourism, t.historic, t.natural, t.landuse === "forest" ? "forest" : undefined, t.boundary, t.waterway, t.tourism];
  for (const value of candidates) {
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
