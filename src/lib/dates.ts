const SK_MONTHS = [
  "január",
  "február",
  "marec",
  "apríl",
  "máj",
  "jún",
  "júl",
  "august",
  "september",
  "október",
  "november",
  "december",
];

const SK_WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

export function monthTitle(year: number, month: number): string {
  return `${SK_MONTHS[month]} ${year}`;
}

export function weekdayLabels(): string[] {
  return SK_WEEKDAYS;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
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
  if (start === end) return start;
  return `${start} – ${end}`;
}
