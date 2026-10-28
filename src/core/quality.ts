import type { Place, Tags } from "./types";

/*
 * Some things match a mood on paper but aren’t worth an outing: a pond in someone’s garden,
 * a pocket park, a memorial plaque in the pavement. These rules weed them out using the
 * size of the mapped shape (a box around it, so a little generous) and whether the place
 * is notable enough to have a Wikipedia or Wikidata entry.
 */

const HECTARE = 10000;

/** Minimum size (m², of the box around the shape) per kind of nature feature. */
const MIN_AREA: { test: (t: Tags) => boolean; m2: number }[] = [
  { test: t => t.leisure === "park", m2: 2 * HECTARE },
  { test: t => t.leisure === "garden" && !/^(botanical|arboretum)$/.test(t["garden:type"] || ""), m2: 3 * HECTARE },
  { test: t => t.natural === "water", m2: 3 * HECTARE },
  { test: t => t.landuse === "forest" || t.natural === "wood", m2: 20 * HECTARE },
  { test: t => t.leisure === "nature_reserve" || t.boundary === "protected_area" || t.boundary === "national_park", m2: 5 * HECTARE }
];

/** Memorial types that are part of the street rather than a place to visit. */
const MINOR_MEMORIALS = /^(stolperstein|stolperschwelle|plaque|blue_plaque|bench|ghost_bike|cross|stone|flood_mark|storm_surge_post)$/;

export const isNotable = (t: Tags) => !!(t.wikidata || t.wikipedia);

/** Whether a place found on the map is worth suggesting as an outing. */
export function worthATrip(p: Pick<Place, "tags" | "area">): boolean {
  const t = p.tags;
  // Strict nature reserves (IUCN Ia) keep visitors out.
  if (t.protect_class === "1a" || t.protect_class === "1") return false;
  if (t.historic === "memorial" && (MINOR_MEMORIALS.test(t.memorial || "") || /stolperstein/i.test(t["memorial:type"] || ""))) return false;
  for (const rule of MIN_AREA) {
    if (!rule.test(t)) continue;
    if (isNotable(t)) return true;
    // A point with no shape gives no size; only trust it if it’s notable.
    return (p.area ?? 0) >= rule.m2;
  }
  return true;
}

/** Approximate area in m² of a box given in degrees. */
export function boxArea(minlat: number, minlon: number, maxlat: number, maxlon: number): number {
  const h = (maxlat - minlat) * 111320;
  const w = (maxlon - minlon) * 111320 * Math.cos(((minlat + maxlat) / 2) * Math.PI / 180);
  return Math.abs(h * w);
}
