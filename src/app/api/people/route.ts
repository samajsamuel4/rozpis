import { NextRequest, NextResponse } from "next/server";
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

export async function GET() {
  const people = await sql<Person>(
    "select id, name, color, created_at::text from people order by name",
  );
  return NextResponse.json(people);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; color?: string };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Meno je povinné" }, { status: 400 });
  }
  const count = await sql<{ c: number }>("select count(*)::int as c from people");
  const color =
    body.color?.trim() || COLORS[(count[0]?.c ?? 0) % COLORS.length];
  const rows = await sql<Person>(
    `insert into people (name, color) values ($1, $2)
     returning id, name, color, created_at::text`,
    [name, color],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    id?: number;
    name?: string;
    color?: string;
  };
  if (!body.id) {
    return NextResponse.json({ error: "Chýba id" }, { status: 400 });
  }
  const name = body.name?.trim();
  const color = body.color?.trim();
  if (!name && !color) {
    return NextResponse.json({ error: "Nie je čo upraviť" }, { status: 400 });
  }
  const rows = await sql<Person>(
    `update people set
       name = coalesce($2, name),
       color = coalesce($3, color)
     where id = $1
     returning id, name, color, created_at::text`,
    [body.id, name ?? null, color ?? null],
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Nenájdené" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Chýba id" }, { status: 400 });
  }
  await sql("delete from people where id = $1", [id]);
  return new NextResponse(null, { status: 204 });
}
