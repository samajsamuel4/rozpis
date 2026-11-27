/** Österreichische Monatsnamen (Jänner!). */
const AT_MONTHS = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const AT_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function monthTitle(year: number, month: number): string {
  return `${AT_MONTHS[month]} ${year}`;
}

export function weekdayLabels(): string[] {
  return AT_WEEKDAYS;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize DB/API date strings to YYYY-MM-DD. */
export function asDay(value: string): string {
  return value.slice(0, 10);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = asDay(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthBounds(year: number, month: number): {
  start: string;
  end: string;
} {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export function calendarCells(
  year: number,
  month: number,
): Array<{ date: string | null; day: number | null }> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first
  const startPad = (first.getDay() + 6) % 7;
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startPad; i++) {
    cells.push({ date: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toISODate(new Date(year, month, day)), day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null });
  }
  return cells;
}

export function formatShortRange(start: string, end: string): string {
  if (start === end) return formatDayAt(start);
  return `${formatDayAt(start)} – ${formatDayAt(end)}`;
}

export function formatDaySk(iso: string): string {
  return formatDayAt(iso);
}

export function formatDayAt(iso: string): string {
  const [y, m, d] = asDay(iso).split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}
