/** Compute worked hours from HH:MM shift bounds (overnight-safe). */
export function shiftDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (
    [sh, sm, eh, em].some((n) => Number.isNaN(n) || n == null) ||
    sh < 0 ||
    sh > 23 ||
    eh < 0 ||
    eh > 23 ||
    sm < 0 ||
    sm > 59 ||
    em < 0 ||
    em > 59
  ) {
    return 0;
  }
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

export function formatHoursAt(hours: number): string {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (m === 0) return `${h} Std.`;
  return `${h}:${String(m).padStart(2, "0")} Std.`;
}

export function sumShiftHours(
  shifts: Array<{ start_time: string; end_time: string }>,
): number {
  return shifts.reduce(
    (sum, s) => sum + shiftDurationHours(s.start_time, s.end_time),
    0,
  );
}
