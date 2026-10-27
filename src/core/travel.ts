import type { LatLon, ModeId } from "./types";

export interface Mode {
  label: string;
  verb: string;
  /** km/h */
  speed: number;
  /** Road distance compared with a straight line. */
  detour: number;
  /** Fixed minutes on top, such as parking. */
  overhead: number;
  gmaps: string;
  apple: string;
}

export const MODES: Record<ModeId, Mode> = {
  foot: { label: "Foot", verb: "on foot", speed: 4.8, detour: 1.3, overhead: 0, gmaps: "walking", apple: "w" },
  bike: { label: "Bike", verb: "by bike", speed: 15, detour: 1.3, overhead: 0, gmaps: "bicycling", apple: "d" },
  car: { label: "Car", verb: "by car", speed: 35, detour: 1.4, overhead: 5, gmaps: "driving", apple: "d" }
};
export const MODE_IDS = Object.keys(MODES) as ModeId[];
export const MAX_RADIUS_M = 40000;

/** Straight-line distance in km. */
export function distKm(a: LatLon, b: LatLon): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Estimated minutes to cover a straight-line distance. */
export const travelMin = (km: number, mode: ModeId): number => {
  const m = MODES[mode];
  return km * m.detour / m.speed * 60 + m.overhead;
};

/** How far (straight line, km) you get in a number of minutes. */
export const radiusKm = (minutes: number, mode: ModeId): number => {
  const m = MODES[mode];
  return Math.max(0.3, (minutes - m.overhead) * m.speed / 60 / m.detour);
};

export const radiusM = (minutes: number, mode: ModeId): number =>
  Math.min(MAX_RADIUS_M, Math.round(radiusKm(minutes, mode) * 1000));

export const fmtKm = (km: number): string =>
  km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
