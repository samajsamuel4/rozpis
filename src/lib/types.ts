export type Person = {
  id: number;
  name: string;
  color: string;
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

export type LeaveRequest = {
  id: number;
  person_id: number;
  start_date: string;
  end_date: string;
  note: string;
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
