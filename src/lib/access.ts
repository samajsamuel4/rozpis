import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Local / unpublished fallback when EDIT_CODE is unset. Not sent to browsers. */
export const FALLBACK_EDIT_CODE = "timovy";

export function expectedEditCode(): string {
  const fromEnv = process.env.EDIT_CODE?.trim() ?? "";
  return fromEnv !== "" ? fromEnv : FALLBACK_EDIT_CODE;
}

export function usesEnvEditCode(): boolean {
  return (process.env.EDIT_CODE?.trim() ?? "") !== "";
}

function codesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Reject cross-site mutation attempts (CSRF). */
export function assertSameOrigin(
  request: NextRequest,
): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    return NextResponse.json(
      { error: "Zakázaný cross-site požiadavok" },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("host");
    if (host && originHost !== host) {
      return NextResponse.json(
        { error: "Zakázaný pôvod požiadavky" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Zakázaný pôvod požiadavky" },
      { status: 403 },
    );
  }
  return null;
}

/** Require shared team edit code on write routes. */
export function assertCanMutate(
  request: NextRequest,
): NextResponse | null {
  const originBlock = assertSameOrigin(request);
  if (originBlock) return originBlock;

  const provided =
    request.headers.get("x-edit-code")?.trim() ??
    request.nextUrl.searchParams.get("edit_code")?.trim() ??
    "";

  if (!provided || !codesMatch(provided, expectedEditCode())) {
    return NextResponse.json(
      {
        error:
          "Na úpravy zadajte tímový editačný kód (hlavička X-Edit-Code).",
      },
      { status: 401 },
    );
  }
  return null;
}
