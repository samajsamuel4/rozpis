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

function requestHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | null) => {
    if (!raw) return;
    for (const part of raw.split(",")) {
      const h = part.trim().toLowerCase();
      if (!h) continue;
      hosts.add(h);
      hosts.add(h.split(":")[0]!);
    }
  };
  add(request.headers.get("x-forwarded-host"));
  add(request.headers.get("host"));
  return hosts;
}

/**
 * CSRF defense for mutations.
 * Writes already require a custom X-Edit-Code header (not sent by plain forms).
 * Behind Cursor Apps the edge Host often differs from the browser Origin, so we
 * trust Sec-Fetch-Site and Origin/X-Forwarded-Host instead of raw Host alone.
 */
export function assertSameOrigin(
  request: NextRequest,
): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    return NextResponse.json(
      { error: "Cross-Site-Anfrage verboten" },
      { status: 403 },
    );
  }
  if (site === "same-origin" || site === "same-site") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients (or older browsers): still gated by EDIT_CODE.
    return null;
  }

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const allowed = requestHosts(request);
    if (
      allowed.size === 0 ||
      allowed.has(originHost) ||
      allowed.has(originHost.split(":")[0]!)
    ) {
      return null;
    }
  } catch {
    return NextResponse.json(
      { error: "Anfrage-Ursprung verboten" },
      { status: 403 },
    );
  }

  // Host headers are often the internal proxy name on Cursor Apps; Origin is
  // the public app URL. Custom X-Edit-Code still required below.
  return null;
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
          "Bearbeitung deaktiviert: EDIT_CODE fehlt in den App-Einstellungen.",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-edit-code")?.trim() ?? "";

  if (!provided || !codesMatch(provided, expected)) {
    return NextResponse.json(
      {
        error:
          "Für Änderungen Team-Code senden (Header X-Edit-Code).",
      },
      { status: 401 },
    );
  }
  return null;
}
