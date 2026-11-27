import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Shared team EDIT_CODE minimum length. */
export const MIN_CODE_LENGTH = 8;
/** Bumped so security review re-scans a fresh tree. */
export const ACCESS_BUILD = "2026-11-27-r8b-sharp-bg";
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_MS = 15 * 60 * 1000;
const MUTATE_WINDOW_MS = 60 * 1000;
const MUTATE_MAX = 40;

type FailBucket = { fails: number[]; lockedUntil: number };
type MutateBucket = { hits: number[] };

type GlobalRate = typeof globalThis & {
  __dienstplanAuthFails?: Map<string, FailBucket>;
  __dienstplanMutateHits?: Map<string, MutateBucket>;
};

function failMap(): Map<string, FailBucket> {
  const g = globalThis as GlobalRate;
  g.__dienstplanAuthFails ??= new Map();
  return g.__dienstplanAuthFails;
}

function mutateMap(): Map<string, MutateBucket> {
  const g = globalThis as GlobalRate;
  g.__dienstplanMutateHits ??= new Map();
  return g.__dienstplanMutateHits;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function pruneOlder(times: number[], windowMs: number, now: number): number[] {
  return times.filter((t) => now - t < windowMs);
}

function isLockedOut(key: string, now: number): number | null {
  const bucket = failMap().get(key);
  if (!bucket) return null;
  if (bucket.lockedUntil > now) return bucket.lockedUntil;
  return null;
}

function recordAuthFailure(key: string, now: number): number | null {
  const map = failMap();
  const bucket = map.get(key) ?? { fails: [], lockedUntil: 0 };
  bucket.fails = pruneOlder(bucket.fails, FAIL_WINDOW_MS, now);
  bucket.fails.push(now);
  if (bucket.fails.length >= FAIL_MAX) {
    bucket.lockedUntil = now + LOCK_MS;
    bucket.fails = [];
  }
  map.set(key, bucket);
  return bucket.lockedUntil > now ? bucket.lockedUntil : null;
}

function clearAuthFailures(key: string): void {
  failMap().delete(key);
}

function recordMutation(key: string, now: number): boolean {
  const map = mutateMap();
  const bucket = map.get(key) ?? { hits: [] };
  bucket.hits = pruneOlder(bucket.hits, MUTATE_WINDOW_MS, now);
  if (bucket.hits.length >= MUTATE_MAX) {
    map.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  map.set(key, bucket);
  return true;
}

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

  return null;
}

/**
 * Require valid EDIT_CODE for schedule reads.
 * The UI gate is not enough alone — APIs must reject anonymous callers.
 * Wrong guesses share the same lockout bucket as writes; missing header is 401
 * without counting a failure.
 */
export function assertCanAccess(
  request: NextRequest,
): NextResponse | null {
  const now = Date.now();
  const key = clientKey(request);

  const lockedUntil = isLockedOut(key, now);
  if (lockedUntil) {
    const retryAfter = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return NextResponse.json(
      {
        error:
          "Zu viele falsche Codes. Bitte später erneut versuchen.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const expected = configuredEditCode();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Zugang deaktiviert: EDIT_CODE fehlt in den App-Einstellungen.",
      },
      { status: 503 },
    );
  }
  if (expected.length < MIN_CODE_LENGTH) {
    return NextResponse.json(
      {
        error: `EDIT_CODE muss mindestens ${MIN_CODE_LENGTH} Zeichen haben.`,
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-edit-code")?.trim() ?? "";
  if (!provided || !codesMatch(provided, expected)) {
    if (provided) {
      const until = recordAuthFailure(key, now);
      if (until) {
        const retryAfter = Math.max(1, Math.ceil((until - now) / 1000));
        return NextResponse.json(
          {
            error:
              "Zu viele falsche Codes. Bitte später erneut versuchen.",
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
          },
        );
      }
    }
    return NextResponse.json(
      {
        error: "Team-Code erforderlich (Header X-Edit-Code).",
      },
      { status: 401 },
    );
  }

  clearAuthFailures(key);
  return null;
}

/**
 * Require host-provided EDIT_CODE on write routes.
 * Shared team code by design; failed guesses are rate-limited / temporarily locked.
 */
export function assertCanMutate(
  request: NextRequest,
): NextResponse | null {
  const originBlock = assertSameOrigin(request);
  if (originBlock) return originBlock;

  const now = Date.now();
  const key = clientKey(request);

  const lockedUntil = isLockedOut(key, now);
  if (lockedUntil) {
    const retryAfter = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return NextResponse.json(
      {
        error:
          "Zu viele falsche Codes. Bitte später erneut versuchen.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  if (!recordMutation(key, now)) {
    return NextResponse.json(
      { error: "Zu viele Änderungen. Bitte kurz warten." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

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
  if (expected.length < MIN_CODE_LENGTH) {
    return NextResponse.json(
      {
        error: `EDIT_CODE muss mindestens ${MIN_CODE_LENGTH} Zeichen haben.`,
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-edit-code")?.trim() ?? "";

  if (!provided || !codesMatch(provided, expected)) {
    const until = recordAuthFailure(key, now);
    if (until) {
      const retryAfter = Math.max(1, Math.ceil((until - now) / 1000));
      return NextResponse.json(
        {
          error:
            "Zu viele falsche Codes. Bitte später erneut versuchen.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }
    return NextResponse.json(
      {
        error:
          "Für Änderungen Team-Code senden (Header X-Edit-Code).",
      },
      { status: 401 },
    );
  }

  clearAuthFailures(key);
  return null;
}
