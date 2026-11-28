import { asDay, parseISODate, toISODate } from "@/lib/dates";
import { openingHoursFor, type OpeningHours } from "@/lib/hours";

export type OpenCountdown =
  | {
      kind: "until_open";
      ms: number;
      opensAt: string;
      dayLabel: "heute" | "morgen" | string;
    }
  | {
      kind: "until_close";
      ms: number;
      closesAt: string;
    }
  | {
      kind: "closed";
      /** Next opening wall-clock, if known. */
      nextAt: string | null;
      nextLabel: string | null;
    };

function atTime(isoDay: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = parseISODate(asDay(isoDay));
  d.setHours(h, m, 0, 0);
  return d;
}

function weekdayShort(iso: string): string {
  const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const wd = (parseISODate(asDay(iso)).getDay() + 6) % 7;
  return labels[wd] ?? "";
}

function findNextOpen(
  from: Date,
): { day: string; hours: OpeningHours; at: Date } | null {
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const day = toISODate(d);
    const hours = openingHoursFor(day);
    if (!hours) continue;
    const openAt = atTime(day, hours.start);
    if (openAt.getTime() > from.getTime()) {
      return { day, hours, at: openAt };
    }
  }
  return null;
}

function dayRelation(todayIso: string, targetIso: string): "heute" | "morgen" | string {
  if (targetIso === todayIso) return "heute";
  const t = parseISODate(todayIso);
  t.setDate(t.getDate() + 1);
  if (toISODate(t) === targetIso) return "morgen";
  return weekdayShort(targetIso);
}

/** Live restaurant countdown from opening hours (Mo closed, etc.). */
export function openCountdownAt(now: Date): OpenCountdown {
  const today = toISODate(now);
  const hours = openingHoursFor(today);

  if (hours) {
    const openAt = atTime(today, hours.start);
    const closeAt = atTime(today, hours.end);
    if (now.getTime() < openAt.getTime()) {
      return {
        kind: "until_open",
        ms: openAt.getTime() - now.getTime(),
        opensAt: hours.start,
        dayLabel: "heute",
      };
    }
    if (now.getTime() < closeAt.getTime()) {
      return {
        kind: "until_close",
        ms: closeAt.getTime() - now.getTime(),
        closesAt: hours.end,
      };
    }
  }

  const next = findNextOpen(now);
  if (!next) {
    return { kind: "closed", nextAt: null, nextLabel: null };
  }

  // Still before next open — if somehow same day after hours, or tomorrow+
  if (hours && today === next.day) {
    // after close today but next is somehow today (shouldn't happen)
  }

  const rel = dayRelation(today, next.day);
  if (rel === "heute" || (hours == null && next.day === today)) {
    return {
      kind: "until_open",
      ms: next.at.getTime() - now.getTime(),
      opensAt: next.hours.start,
      dayLabel: "heute",
    };
  }

  // After closing / closed day: show closed state with next open hint,
  // or countdown if next is soon (tomorrow).
  if (rel === "morgen" && next.at.getTime() - now.getTime() < 18 * 60 * 60 * 1000) {
    return {
      kind: "until_open",
      ms: next.at.getTime() - now.getTime(),
      opensAt: next.hours.start,
      dayLabel: "morgen",
    };
  }

  return {
    kind: "closed",
    nextAt: next.hours.start,
    nextLabel: `${weekdayShort(next.day)} ${next.hours.start}`,
  };
}

export function formatDurationAt(ms: number): string {
  const totalMins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h <= 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}
