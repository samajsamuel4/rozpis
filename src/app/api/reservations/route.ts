import { NextRequest, NextResponse } from "next/server";
import { assertCanMutate } from "@/lib/access";
import { sql } from "@/lib/db";
import type { Reservation } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(request: NextRequest) {
  const denied = await assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    reservation_date?: string;
    reservation_time?: string;
    guest_count?: number;
    guest_name?: string;
    note?: string;
  };

  if (!body.reservation_date) {
    return NextResponse.json({ error: "Datum ist Pflicht" }, { status: 400 });
  }
  const time = body.reservation_time?.trim() || "19:00";
  if (!TIME_RE.test(time)) {
    return NextResponse.json({ error: "Ungültige Uhrzeit" }, { status: 400 });
  }
  const guests = Number(body.guest_count ?? 2);
  if (!Number.isFinite(guests) || guests < 1 || guests > 200) {
    return NextResponse.json(
      { error: "Gästezahl muss zwischen 1 und 200 liegen" },
      { status: 400 },
    );
  }
  const name = body.guest_name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name ist Pflicht" }, { status: 400 });
  }

  const rows = await sql<Reservation>(
    `insert into reservations
       (reservation_date, reservation_time, guest_count, guest_name, note)
     values ($1::date, $2, $3, $4, $5)
     returning id, reservation_date::text as reservation_date,
               reservation_time, guest_count, guest_name, note,
               created_at::text`,
    [body.reservation_date, time, guests, name, body.note?.trim() ?? ""],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = await assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: number;
    reservation_date?: string;
    reservation_time?: string;
    guest_count?: number;
    guest_name?: string;
    note?: string;
  };
  if (!body.id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }

  const existing = await sql<Reservation>(
    `select id, reservation_date::text as reservation_date, reservation_time,
            guest_count, guest_name, note, created_at::text
     from reservations where id = $1`,
    [body.id],
  );
  if (!existing[0]) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const date = body.reservation_date?.trim() || existing[0].reservation_date;
  const time = body.reservation_time?.trim() || existing[0].reservation_time;
  if (!TIME_RE.test(time)) {
    return NextResponse.json({ error: "Ungültige Uhrzeit" }, { status: 400 });
  }
  const guests =
    body.guest_count !== undefined
      ? Number(body.guest_count)
      : existing[0].guest_count;
  if (!Number.isFinite(guests) || guests < 1 || guests > 200) {
    return NextResponse.json(
      { error: "Gästezahl muss zwischen 1 und 200 liegen" },
      { status: 400 },
    );
  }
  const name =
    body.guest_name !== undefined
      ? body.guest_name.trim()
      : existing[0].guest_name;
  if (!name) {
    return NextResponse.json({ error: "Name ist Pflicht" }, { status: 400 });
  }
  const note =
    body.note !== undefined ? body.note.trim() : existing[0].note;

  const rows = await sql<Reservation>(
    `update reservations set
       reservation_date = $2::date,
       reservation_time = $3,
       guest_count = $4,
       guest_name = $5,
       note = $6
     where id = $1
     returning id, reservation_date::text as reservation_date,
               reservation_time, guest_count, guest_name, note,
               created_at::text`,
    [body.id, date, time, guests, name, note],
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const denied = await assertCanMutate(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }
  await sql("delete from reservations where id = $1", [id]);
  return new NextResponse(null, { status: 204 });
}
