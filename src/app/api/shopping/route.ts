import { NextRequest, NextResponse } from "next/server";
import { assertCanAccess, assertCanMutate } from "@/lib/access";
import { sql } from "@/lib/db";
import {
  isShoppingCategory,
  type ShoppingItem,
} from "@/lib/shopping";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = assertCanAccess(request);
  if (denied) return denied;

  const items = await sql<ShoppingItem>(
    `select id, category, label, done, sort_order, created_at::text
     from shopping_items
     order by category, sort_order, id`,
  );
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    category?: string;
    label?: string;
  };
  const category = body.category?.trim() ?? "";
  const label = body.label?.trim() ?? "";
  if (!isShoppingCategory(category)) {
    return NextResponse.json({ error: "Kategorie ungültig" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "Name ist Pflicht" }, { status: 400 });
  }

  const max = await sql<{ m: number }>(
    `select coalesce(max(sort_order), 0)::int as m
     from shopping_items where category = $1`,
    [category],
  );
  const sortOrder = (max[0]?.m ?? 0) + 1;

  const rows = await sql<ShoppingItem>(
    `insert into shopping_items (category, label, sort_order)
     values ($1, $2, $3)
     returning id, category, label, done, sort_order, created_at::text`,
    [category, label, sortOrder],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: number;
    done?: boolean;
    label?: string;
  };
  if (!body.id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }

  const existing = await sql<ShoppingItem>(
    `select id, category, label, done, sort_order, created_at::text
     from shopping_items where id = $1`,
    [body.id],
  );
  if (!existing[0]) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const done =
    body.done !== undefined ? Boolean(body.done) : existing[0].done;
  const label =
    body.label !== undefined ? body.label.trim() : existing[0].label;
  if (!label) {
    return NextResponse.json({ error: "Name ist Pflicht" }, { status: 400 });
  }

  const rows = await sql<ShoppingItem>(
    `update shopping_items
     set done = $2, label = $3
     where id = $1
     returning id, category, label, done, sort_order, created_at::text`,
    [body.id, done, label],
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const denied = assertCanMutate(request);
  if (denied) return denied;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }
  await sql("delete from shopping_items where id = $1", [id]);
  return new NextResponse(null, { status: 204 });
}
