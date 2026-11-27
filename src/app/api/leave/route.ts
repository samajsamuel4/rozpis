import { NextRequest, NextResponse } from "next/server";
import { assertCanMutate } from "@/lib/access";
import { sql } from "@/lib/db";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    person_id?: number;
    start_date?: string;
    end_date?: string;
    note?: string;
  };
  if (!body.person_id || !body.start_date || !body.end_date) {
    return NextResponse.json(
      { error: "Person und Zeitraum sind Pflicht" },
      { status: 400 },
    );
  }
  if (body.end_date < body.start_date) {
    return NextResponse.json(
      { error: "Ende muss nach dem Start liegen" },
      { status: 400 },
    );
  }
  const rows = await sql<LeaveRequest>(
    `insert into leave_requests (person_id, start_date, end_date, note, status)
     values ($1, $2::date, $3::date, $4, 'pending')
     returning id, person_id, start_date::text as start_date,
               end_date::text as end_date, note, status, created_at::text`,
    [body.person_id, body.start_date, body.end_date, body.note?.trim() ?? ""],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: number;
    status?: "pending" | "approved" | "cancelled";
  };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "ID oder Status fehlt" }, { status: 400 });
  }
  if (!["pending", "approved", "cancelled"].includes(body.status)) {
    return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
  }
  const rows = await sql<LeaveRequest>(
    `update leave_requests set status = $2
     where id = $1
     returning id, person_id, start_date::text as start_date,
               end_date::text as end_date, note, status, created_at::text`,
    [body.id, body.status],
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
