import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    person_id?: number;
    work_date?: string;
    start_time?: string;
    end_time?: string;
    note?: string;
  };
  if (!body.person_id || !body.work_date) {
    return NextResponse.json(
      { error: "Osoba a dátum sú povinné" },
      { status: 400 },
    );
  }
  const start = body.start_time?.trim() || "08:00";
  const end = body.end_time?.trim() || "16:00";
  const note = body.note?.trim() ?? "";

  const rows = await sql<Shift>(
    `insert into shifts (person_id, work_date, start_time, end_time, note, updated_at)
     values ($1, $2::date, $3, $4, $5, now())
     on conflict (person_id, work_date) do update set
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       note = excluded.note,
       updated_at = now()
     returning id, person_id, work_date::text as work_date,
               start_time, end_time, note`,
    [body.person_id, body.work_date, start, end, note],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  const personId = Number(request.nextUrl.searchParams.get("person_id"));
  const workDate = request.nextUrl.searchParams.get("work_date");

  if (id) {
    await sql("delete from shifts where id = $1", [id]);
    return new NextResponse(null, { status: 204 });
  }
  if (personId && workDate) {
    await sql(
      "delete from shifts where person_id = $1 and work_date = $2::date",
      [personId, workDate],
    );
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: "Chýba id alebo osoba+dátum" }, { status: 400 });
}
