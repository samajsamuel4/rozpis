import { NextRequest, NextResponse } from "next/server";
import { assertCanMutate } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Verify team EDIT_CODE before entering the app. */
export async function POST(request: NextRequest) {
  const denied = await assertCanMutate(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
