import type { StartPoint } from "../core/types";
import { getJson } from "./http";

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimAddress { country_code?: string; state?: string; suburb?: string; neighbourhood?: string; quarter?: string; city_district?: string; town?: string; city?: string; village?: string }

/** Finds a typed address or place name. Returns null when nothing matches. */
export async function searchPlace(q: string, lang: string, signal?: AbortSignal): Promise<StartPoint | null> {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=1&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  const j = await getJson<{ lat: string; lon: string; display_name: string; address?: NominatimAddress }[]>(url, 15000, signal);
  if (!j.length) return null;
  const r = j[0];
  return { lat: +r.lat, lon: +r.lon, label: r.display_name.split(",").slice(0, 3).join(",").trim(), cc: r.address?.country_code || "", state: r.address?.state || "" };
}

/** Names the neighborhood around a point, for “Your location, near …”. */
export async function describePoint(lat: number, lon: number, lang: string, signal?: AbortSignal): Promise<{ near: string; cc: string; state: string } | null> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=16&accept-language=${lang}&lat=${lat}&lon=${lon}`;
  const j = await getJson<{ address?: NominatimAddress }>(url, 10000, signal);
  const a = j?.address;
  if (!a) return null;
  return {
    near: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.city || a.village || "",
    cc: a.country_code || "", state: a.state || ""
  };
}

export interface PlaceHit {
  place: { id: string; name: string; lat: number; lon: number; tags: Record<string, string> };
  /** Short address for telling similar names apart. */
  where: string;
}

interface NominatimPlace {
  osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string;
  category?: string; type?: string; extratags?: Record<string, string> | null;
}

/**
 * Finds places by name, preferring ones near `near`. Nominatim’s rules don’t allow
 * search-as-you-type, so call this only when someone presses Search.
 */
export async function searchPlaces(q: string, lang: string, near: { lat: number; lon: number } | null, signal?: AbortSignal): Promise<PlaceHit[]> {
  const box = near ? `&viewbox=${near.lon - 0.3},${near.lat + 0.2},${near.lon + 0.3},${near.lat - 0.2}` : "";
  const url = `${NOMINATIM}/search?format=jsonv2&limit=8&extratags=1&addressdetails=0&accept-language=${lang}&q=${encodeURIComponent(q)}${box}`;
  const rows = await getJson<NominatimPlace[]>(url, 15000, signal);
  return rows.filter(r => r.name).map(r => {
    const tags: Record<string, string> = { ...(r.extratags || {}), name: r.name! };
    if (r.category && r.type) tags[r.category] = r.type;
    return {
      place: { id: `${r.osm_type}/${r.osm_id}`, name: r.name!, lat: +r.lat, lon: +r.lon, tags },
      where: r.display_name.split(",").slice(1, 4).join(",").trim()
    };
  });
}
