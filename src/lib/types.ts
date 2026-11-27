export type Person = {
  id: number;
  name: string;
  color: string;
  work_start: string;
  work_end: string;
  created_at: string;
};

export type Shift = {
  id: number;
  person_id: number;
  work_date: string;
  start_time: string;
  end_time: string;
  note: string;
  person_name?: string;
  person_color?: string;
};

export type LeaveType = "free_day" | "vacation";

export type LeaveRequest = {
  id: number;
  person_id: number;
  start_date: string;
  end_date: string;
  note: string;
  leave_type: LeaveType;
  status: "pending" | "approved" | "cancelled";
  created_at: string;
  person_name?: string;
  person_color?: string;
};

export type Reservation = {
  id: number;
  reservation_date: string;
  reservation_time: string;
  guest_count: number;
  guest_name: string;
  note: string;
  created_at: string;
};

/** Public calendar aggregate — no guest names or notes. */
export type ReservationDayTotal = {
  date: string;
  guests: number;
  count: number;
};

export type AppState = {
  sampleMode: boolean;
  /** Non-secret build stamp for deploy/review freshness. */
  build?: string;
  people: Person[];
  shifts: Shift[];
  /** Leave notes omitted on public reads (no note key). */
  leave: Array<Omit<LeaveRequest, "note"> & { note?: string }>;
  /** Empty for public reads; full rows only with valid X-Edit-Code. */
  reservations: Reservation[];
  /** Per-day guest totals (safe for public calendar chips). */
  reservationTotals: ReservationDayTotal[];
  year: number;
  month: number;
};

export const LEAVE_TYPE_AT: Record<LeaveType, string> = {
  free_day: "Frei",
  vacation: "Frei",
};

export const LEAVE_TYPE_SHORT_AT: Record<LeaveType, string> = {
  free_day: "frei",
  vacation: "frei",
};

/** Calendar / list colors — all leave shown as Frei. */
export const LEAVE_TYPE_COLORS: Record<
  LeaveType,
  { bg: string; fg: string; border: string }
> = {
  free_day: {
    bg: "var(--free-day-soft)",
    fg: "var(--free-day)",
    border: "color-mix(in srgb, var(--free-day) 45%, transparent)",
  },
  vacation: {
    bg: "var(--free-day-soft)",
    fg: "var(--free-day)",
    border: "color-mix(in srgb, var(--free-day) 45%, transparent)",
  },
};

export const WORK_CHIP_BG = "var(--work)";
