import { addDays, DAY, sameDay, wallTime } from "./time";

export interface SunLocation {
  latitude: number;
  longitude: number;
}

/** Cloudflare's connection location can be missing (including in local development). */
export function approximateSunLocation(latitude: unknown, longitude: unknown): SunLocation | null {
  if (typeof latitude !== "string" || !latitude.trim() || typeof longitude !== "string" || !longitude.trim()) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
    ? { latitude: lat, longitude: lon }
    : null;
}

/** Sunrise/sunset using NOAA's solar equations.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
// shortcut: approximate sea-level times; account for elevation/terrain when minute-level precision is needed.
export function sunTimes(day: number, tz: string, { latitude, longitude }: SunLocation) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
  const rad = Math.PI / 180;
  const times: { kind: "sunrise" | "sunset"; at: number }[] = [];
  // UTC dates either side also cover zones near the date line and events crossing midnight.
  for (const shift of [-1, 0, 1]) {
    const w = wallTime(addDays(day, shift, tz), tz);
    const midnight = Date.UTC(w.year, w.month - 1, w.day);
    const yearStart = Date.UTC(w.year, 0, 1);
    const yearDays = (Date.UTC(w.year + 1, 0, 1) - yearStart) / DAY;
    const g = (2 * Math.PI / yearDays) * ((midnight - yearStart) / DAY);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = latitude * rad;
    const cosHour = Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
    if (Math.abs(cosHour) > 1) continue; // No sunrise/sunset during polar day or night.
    const hour = Math.acos(cosHour) / rad;
    for (const kind of ["sunrise", "sunset"] as const) {
      const at = midnight + (720 - 4 * (longitude + (kind === "sunrise" ? hour : -hour)) - eq) * 60_000;
      if (sameDay(at, day, tz)) times.push({ kind, at });
    }
  }
  return times.sort((a, b) => a.at - b.at);
}
