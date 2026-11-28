import { asDay, parseISODate, toISODate } from "@/lib/dates";
import { openingHoursFor, type OpeningHours } from "@/lib/hours";

/** Fitz kitchen clock — Vienna / Bratislava local. */
export const FITZ_TZ = "Europe/Vienna";

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
      nextAt: string | null;
      nextLabel: string | null;
    };

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  iso: string;
};

function localParts(now: Date): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: FITZ_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  const hour = Number(bag.hour);
  const minute = Number(bag.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Instant for HH:MM on a calendar day in Fitz TZ. */
function instantOnDay(isoDay: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // Walk a UTC guess then correct via formatter (handles CET/CEST).
  const [y, mo, d] = asDay(isoDay).split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d, h - 1, m, 0); // Vienna ≈ UTC+1/+2
  for (let i = 0; i < 4; i++) {
    const parts = localParts(new Date(guess));
    const wantMins = h * 60 + m;
    const gotMins = parts.hour * 60 + parts.minute;
    const dayDrift =
      parts.iso === isoDay
        ? 0
        : parts.iso < isoDay
          ? -24 * 60
          : 24 * 60;
    const deltaMins = wantMins - (gotMins + dayDrift);
    if (deltaMins === 0 && parts.iso === isoDay) {
      return new Date(guess);
    }
    guess += deltaMins * 60_000;
  }
  return new Date(guess);
}

function weekdayShort(iso: string): string {
  const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const wd = (parseISODate(asDay(iso)).getDay() + 6) % 7;
  return labels[wd] ?? "";
}

function addDaysIso(iso: string, days: number): string {
  const d = parseISODate(asDay(iso));
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function findNextOpen(
  from: Date,
  fromIso: string,
): { day: string; hours: OpeningHours; at: Date } | null {
  for (let i = 0; i < 8; i++) {
    const day = addDaysIso(fromIso, i);
    const hours = openingHoursFor(day);
    if (!hours) continue;
    const openAt = instantOnDay(day, hours.start);
    if (openAt.getTime() > from.getTime()) {
      return { day, hours, at: openAt };
    }
  }
  return null;
}

function dayRelation(
  todayIso: string,
  targetIso: string,
): "heute" | "morgen" | string {
  if (targetIso === todayIso) return "heute";
  if (addDaysIso(todayIso, 1) === targetIso) return "morgen";
  return weekdayShort(targetIso);
}

/** Live restaurant countdown from opening hours (Mo closed, etc.). */
export function openCountdownAt(now: Date): OpenCountdown {
  const local = localParts(now);
  const today = local.iso;
  const hours = openingHoursFor(today);

  if (hours) {
    const openAt = instantOnDay(today, hours.start);
    const closeAt = instantOnDay(today, hours.end);
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

  const next = findNextOpen(now, today);
  if (!next) {
    return { kind: "closed", nextAt: null, nextLabel: null };
  }

  const rel = dayRelation(today, next.day);
  // Soon until next open (e.g. late evening → tomorrow morning)
  if (
    (rel === "heute" || rel === "morgen") &&
    next.at.getTime() - now.getTime() <= 18 * 60 * 60 * 1000
  ) {
    return {
      kind: "until_open",
      ms: next.at.getTime() - now.getTime(),
      opensAt: next.hours.start,
      dayLabel: rel === "heute" ? "heute" : "morgen",
    };
  }

  return {
    kind: "closed",
    nextAt: next.hours.start,
    nextLabel: `${weekdayShort(next.day)} ${next.hours.start}`,
  };
}

export function formatDurationAt(ms: number): string {
  const totalMins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h <= 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}
