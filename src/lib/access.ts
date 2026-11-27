import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function configuredEditCode(): string | null {
  const fromEnv = process.env.EDIT_CODE?.trim() ?? "";
  return fromEnv !== "" ? fromEnv : null;
}

function codesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Reject cross-site mutation attempts (CSRF).
 * Requires Origin (or same-origin Sec-Fetch-Site) matching this host.
 */
export function assertSameOrigin(
  request: NextRequest,
): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "none") {
    return NextResponse.json(
      { error: "Zakázaný cross-site požiadavok" },
      { status: 403 },
    );
  }

  const host = request.headers.get("host");
  if (!host) {
    return NextResponse.json(
      { error: "Chýba hostiteľ požiadavky" },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json(
          { error: "Zakázaný pôvod požiadavky" },
          { status: 403 },
        );
      }
      return null;
    } catch {
      return NextResponse.json(
        { error: "Zakázaný pôvod požiadavky" },
        { status: 403 },
      );
    }
  }

  // No Origin: only allow when the browser marks this as same-origin.
  if (site === "same-origin") return null;

  return NextResponse.json(
    { error: "Chýba pôvod požiadavky (Origin)" },
    { status: 403 },
  );
}

/** Require host-provided EDIT_CODE on write routes. No hardcoded fallback. */
export function assertCanMutate(
  request: NextRequest,
): NextResponse | null {
  const originBlock = assertSameOrigin(request);
  if (originBlock) return originBlock;

  const expected = configuredEditCode();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Úpravy nie sú zapnuté: chýba EDIT_CODE v nastavení aplikácie.",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-edit-code")?.trim() ?? "";

  if (!provided || !codesMatch(provided, expected)) {
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
