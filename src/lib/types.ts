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

export type AppState = {
  sampleMode: boolean;
  people: Person[];
  shifts: Shift[];
  leave: LeaveRequest[];
  year: number;
  month: number;
};

export const LEAVE_TYPE_AT: Record<LeaveType, string> = {
  free_day: "Freier Tag",
  vacation: "Urlaub",
};

export const LEAVE_TYPE_SHORT_AT: Record<LeaveType, string> = {
  free_day: "frei",
  vacation: "Urlaub",
};

/** Calendar / list colors: work green, free day soft red, vacation deep red. */
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
    bg: "var(--vacation-soft)",
    fg: "#ffc9c9",
    border: "color-mix(in srgb, var(--vacation) 55%, transparent)",
  },
};

export const WORK_CHIP_BG = "var(--work)";
