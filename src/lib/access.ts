import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** Shared team EDIT_CODE minimum length. */
export const MIN_CODE_LENGTH = 8;
/** Bumped so security review re-scans a fresh tree. */
export const ACCESS_BUILD = "2026-11-28-r9-db-rate";

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_MS = 15 * 60 * 1000;
const MUTATE_WINDOW_MS = 60 * 1000;
const MUTATE_MAX = 40;

const AUTH_BUCKET = "team-auth";
const MUTATE_BUCKET = "team-mutate";

type RateRow = {
  bucket: string;
  fail_count: number;
  window_start_ms: number | string;
  locked_until_ms: number | string;
  mutate_count: number;
  mutate_window_start_ms: number | string;
};

function num(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

/**
 * Rate limits live in Postgres (not spoofable client IPs).
 * Buckets are shared across instances; they are process-global only when
 * DATABASE_URL is unset (local PGlite), which is sample/dev mode.
 */
async function ensureBucket(bucket: string): Promise<void> {
  await sql(
    `insert into rate_limits (bucket) values ($1)
     on conflict (bucket) do nothing`,
    [bucket],
  );
}

async function loadBucket(bucket: string): Promise<RateRow> {
  await ensureBucket(bucket);
  const rows = await sql<RateRow>(
    `select bucket, fail_count, window_start_ms, locked_until_ms,
            mutate_count, mutate_window_start_ms
     from rate_limits where bucket = $1`,
    [bucket],
  );
  return rows[0]!;
}

async function lockedUntilMs(bucket: string, now: number): Promise<number | null> {
  const row = await loadBucket(bucket);
  const until = num(row.locked_until_ms);
  return until > now ? until : null;
}

async function recordAuthFailure(now: number): Promise<number | null> {
  await ensureBucket(AUTH_BUCKET);
  const row = await loadBucket(AUTH_BUCKET);
  let failCount = num(row.fail_count);
  let windowStart = num(row.window_start_ms);
  let lockedUntil = num(row.locked_until_ms);

  if (lockedUntil > now) return lockedUntil;

  if (windowStart === 0 || now - windowStart > FAIL_WINDOW_MS) {
    failCount = 0;
    windowStart = now;
  }
  failCount += 1;
  if (failCount >= FAIL_MAX) {
    lockedUntil = now + LOCK_MS;
    failCount = 0;
    windowStart = now;
  }

  await sql(
    `update rate_limits
     set fail_count = $2,
         window_start_ms = $3,
         locked_until_ms = $4,
         updated_at = now()
     where bucket = $1`,
    [AUTH_BUCKET, failCount, windowStart, lockedUntil],
  );
  return lockedUntil > now ? lockedUntil : null;
}

async function clearAuthFailures(): Promise<void> {
  await sql(
    `update rate_limits
     set fail_count = 0,
         window_start_ms = 0,
         locked_until_ms = 0,
         updated_at = now()
     where bucket = $1`,
    [AUTH_BUCKET],
  );
}

async function recordMutation(now: number): Promise<boolean> {
  await ensureBucket(MUTATE_BUCKET);
  const row = await loadBucket(MUTATE_BUCKET);
  let mutateCount = num(row.mutate_count);
  let mutateWindow = num(row.mutate_window_start_ms);

  if (mutateWindow === 0 || now - mutateWindow > MUTATE_WINDOW_MS) {
    mutateCount = 0;
    mutateWindow = now;
  }
  if (mutateCount >= MUTATE_MAX) {
    return false;
  }
  mutateCount += 1;
  await sql(
    `update rate_limits
     set mutate_count = $2,
         mutate_window_start_ms = $3,
         updated_at = now()
     where bucket = $1`,
    [MUTATE_BUCKET, mutateCount, mutateWindow],
  );
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

function lockedResponse(lockedUntil: number, now: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  return NextResponse.json(
    {
      error: "Zu viele falsche Codes. Bitte später erneut versuchen.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

/**
 * CSRF defense for mutations.
 * Rejects when both Sec-Fetch-Site and Origin are absent.
 * Writes also require custom X-Edit-Code (not sent by plain HTML forms).
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (!site && !origin) {
    return NextResponse.json(
      { error: "Anfrage-Ursprung fehlt" },
      { status: 403 },
    );
  }

  if (site === "cross-site") {
    return NextResponse.json(
      { error: "Cross-Site-Anfrage verboten" },
      { status: 403 },
    );
  }
  if (site === "same-origin" || site === "same-site") {
    return null;
  }

  if (!origin) {
    return NextResponse.json(
      { error: "Anfrage-Ursprung verboten" },
      { status: 403 },
    );
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

  return NextResponse.json(
    { error: "Anfrage-Ursprung verboten" },
    { status: 403 },
  );
}

/**
 * Require valid EDIT_CODE for schedule reads.
 * Failed guesses use a Postgres-backed shared bucket (not client IP).
 */
export async function assertCanAccess(
  request: NextRequest,
): Promise<NextResponse | null> {
  const now = Date.now();

  const lockedUntil = await lockedUntilMs(AUTH_BUCKET, now);
  if (lockedUntil) return lockedResponse(lockedUntil, now);

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
      const until = await recordAuthFailure(now);
      if (until) return lockedResponse(until, now);
    }
    return NextResponse.json(
      {
        error: "Team-Code erforderlich (Header X-Edit-Code).",
      },
      { status: 401 },
    );
  }

  await clearAuthFailures();
  return null;
}

/**
 * Require host-provided EDIT_CODE on write routes.
 * CSRF + Postgres-backed mutation throttle (shared across instances).
 */
export async function assertCanMutate(
  request: NextRequest,
): Promise<NextResponse | null> {
  const originBlock = assertSameOrigin(request);
  if (originBlock) return originBlock;

  const now = Date.now();

  const lockedUntil = await lockedUntilMs(AUTH_BUCKET, now);
  if (lockedUntil) return lockedResponse(lockedUntil, now);

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
    const until = await recordAuthFailure(now);
    if (until) return lockedResponse(until, now);
    return NextResponse.json(
      {
        error: "Für Änderungen Team-Code senden (Header X-Edit-Code).",
      },
      { status: 401 },
    );
  }

  await clearAuthFailures();

  if (!(await recordMutation(now))) {
    return NextResponse.json(
      { error: "Zu viele Änderungen. Bitte kurz warten." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  return null;
}
