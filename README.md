# Rozpis

Tímový pracovný kalendár (Slovak UI): zmeny, žiadosti o voľno, správa kolegov.

## Local

```bash
env -u DATABASE_URL npm run dev
```

Without `DATABASE_URL` the app uses in-memory PGlite + sample data (banner in UI).

## Stack

- Next.js App Router
- Postgres via `cursor-app.json` + `migrations/` (publish-app)
- Public link collaboration with in-browser **Kto som** picker

## Scripts

- `npm run dev` — development server
- `npm run build` — production build + migrate when `DATABASE_URL` is set
- `npm start` — start production server
