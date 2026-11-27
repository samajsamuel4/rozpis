import { asDay, parseISODate } from "@/lib/dates";

export type OpeningHours = { start: string; end: string };

/** Fitz kitchen week: Mo closed; Di–Do 16–22; Fr–Sa 11–22; So 11–22. */
export function weekdayIndex(iso: string): number {
  // 0 = Monday … 6 = Sunday (matches calendarCells Monday-first)
  return (parseISODate(asDay(iso)).getDay() + 6) % 7;
}

export function isClosedDay(iso: string): boolean {
  return weekdayIndex(iso) === 0;
}

export function openingHoursFor(iso: string): OpeningHours | null {
  if (isClosedDay(iso)) return null;
  const wd = weekdayIndex(iso);
  // Di–Do (1–3)
  if (wd >= 1 && wd <= 3) return { start: "16:00", end: "22:00" };
  // Fr–So (4–6)
  return { start: "11:00", end: "22:00" };
}

export const OPENING_HOURS_SUMMARY =
  "Mo geschlossen · Di–Do 16–22 · Fr–Sa 11–22";
