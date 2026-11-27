import { NextRequest, NextResponse } from "next/server";
import { assertCanMutate } from "@/lib/access";
import { sql } from "@/lib/db";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLORS = [
  "#2f6f5e",
  "#3d5a80",
  "#8b5e3c",
  "#5c4d7a",
  "#6b4f3a",
  "#1f5f6b",
  "#7a4e4e",
  "#4a6741",
];

const TIME_RE = /^\d{2}:\d{2}$/;

function normalizeTime(value: string | undefined, fallback: string): string {
  const v = value?.trim() ?? "";
  return TIME_RE.test(v) ? v : fallback;
}

export async function GET() {
  const people = await sql<Person>(
    `select id, name, color, work_start, work_end, created_at::text
     from people order by name`,
  );
  return NextResponse.json(people);
}

export async function POST(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    name?: string;
    color?: string;
    work_start?: string;
    work_end?: string;
  };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name ist Pflicht" }, { status: 400 });
  }
  const workStart = normalizeTime(body.work_start, "08:00");
  const workEnd = normalizeTime(body.work_end, "16:00");
  const count = await sql<{ c: number }>("select count(*)::int as c from people");
  const color =
    body.color?.trim() || COLORS[(count[0]?.c ?? 0) % COLORS.length];
  const rows = await sql<Person>(
    `insert into people (name, color, work_start, work_end) values ($1, $2, $3, $4)
     returning id, name, color, work_start, work_end, created_at::text`,
    [name, color, workStart, workEnd],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: number;
    name?: string;
    color?: string;
    work_start?: string;
    work_end?: string;
  };
  if (!body.id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }
  const name = body.name?.trim();
  const color = body.color?.trim();
  const workStart =
    body.work_start !== undefined
      ? normalizeTime(body.work_start, "08:00")
      : undefined;
  const workEnd =
    body.work_end !== undefined
      ? normalizeTime(body.work_end, "16:00")
      : undefined;
  if (!name && !color && workStart === undefined && workEnd === undefined) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }
  const rows = await sql<Person>(
    `update people set
       name = coalesce($2, name),
       color = coalesce($3, color),
       work_start = coalesce($4, work_start),
       work_end = coalesce($5, work_end)
     where id = $1
     returning id, name, color, work_start, work_end, created_at::text`,
    [body.id, name ?? null, color ?? null, workStart ?? null, workEnd ?? null],
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }
  await sql("delete from people where id = $1", [id]);
  return new NextResponse(null, { status: 204 });
}
