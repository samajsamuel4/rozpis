import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
let pool: pg.Pool | undefined;

type GlobalDb = typeof globalThis & {
  __rozpisPglite?: Promise<PGlite>;
};

export function isSampleMode(): boolean {
  return databaseUrl === "";
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await pool.query(text, params)).rows as T[];
  }
  const g = globalThis as GlobalDb;
  g.__rozpisPglite ??= startLocal().catch((error: unknown) => {
    g.__rozpisPglite = undefined;
    throw error;
  });
  return (await (await g.__rozpisPglite).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  await seedSample(db);
  return db;
}

async function seedSample(db: PGlite): Promise<void> {
  const existing = await db.query<{ c: number }>(
    "select count(*)::int as c from people",
  );
  if ((existing.rows[0]?.c ?? 0) > 0) return;

  await db.exec(`
    insert into people (name, color) values
      ('Samuel', '#2f6f5e'),
      ('Mária', '#3d5a80'),
      ('Peter', '#8b5e3c'),
      ('Jana', '#5c4d7a');
  `);

  const people = await db.query<{ id: number; name: string }>(
    "select id, name from people order by id",
  );
  const byName = Object.fromEntries(people.rows.map((p) => [p.name, p.id]));
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = (d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const shifts: Array<[number, string, string, string]> = [
    [byName.Samuel, iso(3), "08:00", "16:00"],
    [byName.Samuel, iso(5), "08:00", "16:00"],
    [byName.Samuel, iso(10), "09:00", "17:00"],
    [byName.Mária, iso(3), "08:00", "14:00"],
    [byName.Mária, iso(4), "08:00", "16:00"],
    [byName.Peter, iso(5), "12:00", "20:00"],
    [byName.Peter, iso(11), "08:00", "16:00"],
    [byName.Jana, iso(6), "08:00", "16:00"],
    [byName.Jana, iso(12), "10:00", "18:00"],
  ];

  for (const [personId, date, start, end] of shifts) {
    await db.query(
      `insert into shifts (person_id, work_date, start_time, end_time)
       values ($1, $2, $3, $4)`,
      [personId, date, start, end],
    );
  }

  await db.query(
    `insert into leave_requests (person_id, start_date, end_date, note, status)
     values ($1, $2, $3, $4, 'pending')`,
    [byName.Mária, iso(18), iso(20), "Rodinná záležitosť"],
  );
  await db.query(
    `insert into leave_requests (person_id, start_date, end_date, note, status)
     values ($1, $2, $3, $4, 'approved')`,
    [byName.Peter, iso(25), iso(26), "Voľno"],
  );
}
