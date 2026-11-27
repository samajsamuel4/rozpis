import { NextRequest, NextResponse } from "next/server";
import { monthBounds } from "@/lib/dates";
import { isSampleMode, sql } from "@/lib/db";
import type { LeaveRequest, Person, Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const now = new Date();
  const year = Number(
    request.nextUrl.searchParams.get("year") ?? now.getFullYear(),
  );
  const month = Number(
    request.nextUrl.searchParams.get("month") ?? now.getMonth(),
  );
  const { start, end } = monthBounds(year, month);

  const people = await sql<Person>(
    `select id, name, color, work_start, work_end, created_at::text
     from people order by name`,
  );

  const shifts = await sql<Shift>(
    `select s.id, s.person_id, s.work_date::text as work_date,
            s.start_time, s.end_time, s.note,
            p.name as person_name, p.color as person_color
     from shifts s
     join people p on p.id = s.person_id
     where s.work_date >= $1::date and s.work_date <= $2::date
     order by s.work_date, s.start_time, p.name`,
    [start, end],
  );

  const leave = await sql<LeaveRequest>(
    `select l.id, l.person_id, l.start_date::text as start_date,
            l.end_date::text as end_date, l.note, l.status,
            coalesce(l.leave_type, 'free_day') as leave_type,
            l.created_at::text as created_at,
            p.name as person_name, p.color as person_color
     from leave_requests l
     join people p on p.id = l.person_id
     where l.status <> 'cancelled'
       and l.start_date <= $2::date
       and l.end_date >= $1::date
     order by l.start_date, p.name`,
    [start, end],
  );

  return NextResponse.json({
    sampleMode: isSampleMode(),
    people,
    shifts,
    leave,
    year,
    month,
  });
}
