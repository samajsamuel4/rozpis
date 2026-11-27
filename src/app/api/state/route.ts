import { NextRequest, NextResponse } from "next/server";
import { ACCESS_BUILD, assertCanAccess } from "@/lib/access";
import { monthBounds } from "@/lib/dates";
import { isSampleMode, sql } from "@/lib/db";
import type {
  LeaveRequest,
  Person,
  Reservation,
  ReservationDayTotal,
  Shift,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Authenticated schedule read only. Anonymous GET must 401 — there is no
 * public/redacted payload path in this route.
 */
export async function GET(request: NextRequest) {
  const denied = await assertCanAccess(request);
  if (denied) return denied;

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

  const reservations = await sql<Reservation>(
    `select id, reservation_date::text as reservation_date,
            reservation_time, guest_count, guest_name, note,
            created_at::text
     from reservations
     where reservation_date >= $1::date and reservation_date <= $2::date
     order by reservation_date, reservation_time, guest_name`,
    [start, end],
  );

  const reservationTotals: ReservationDayTotal[] = [];
  for (const r of reservations) {
    const date = r.reservation_date;
    const existing = reservationTotals.find((t) => t.date === date);
    if (existing) {
      existing.guests += Number(r.guest_count || 0);
      existing.count += 1;
    } else {
      reservationTotals.push({
        date,
        guests: Number(r.guest_count || 0),
        count: 1,
      });
    }
  }

  return NextResponse.json({
    sampleMode: isSampleMode(),
    build: ACCESS_BUILD,
    people,
    shifts,
    leave,
    reservations,
    reservationTotals,
    year,
    month,
  });
}
