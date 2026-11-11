# Curtainly

Every play and musical running near you (professional, indie, community and college), starting with San Diego County.

> Working name. A final name and domain are chosen before public sharing.

- **Plan:** [docs/PLAN.md](docs/PLAN.md), the product and technical plan
- **Decisions:** [docs/DECISIONS.md](docs/DECISIONS.md), changes to the plan and why
- **Work tracking:** [GitHub milestones](https://github.com/TonyQ032/curtainly/milestones) M0–M5, one per MVP epic

## Repo layout

| Package   | What it is                                                                |
| --------- | ------------------------------------------------------------------------- |
| `web/`    | Next.js (App Router) public site and `/admin` area, deployed on Vercel    |
| `ingest/` | Source adapters and the runner, run daily by GitHub Actions               |
| `shared/` | Drizzle schema and migrations, domain enums, title normalization/matching |

## Getting started

Requires Node 22+ and pnpm 10 (`npm i -g pnpm@10` or `corepack enable`).

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL once Supabase exists
pnpm dev                      # http://localhost:3000
```

| Command                                      | Does                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | What CI runs on every PR                            |
| `pnpm format`                                | Prettier                                            |
| `pnpm db:generate`                           | Generate a migration from `shared/src/db/schema.ts` |
| `pnpm db:migrate`                            | Apply migrations to `DATABASE_URL`                  |
| `pnpm ingest`                                | Run the ingest job locally                          |

## Database

`DATABASE_URL` in the root `.env` points every command at one database. Use the Supabase **session pooler** string (port 5432), with the password in place of `[YOUR-PASSWORD]` (no brackets).

```bash
pnpm db:migrate   # apply shared/drizzle migrations
pnpm db:seed      # insert reference data (San Diego region; registry later). Safe to rerun
```

Changing the schema: edit `shared/src/db/schema.ts`, run `pnpm db:generate`, review the SQL in `shared/drizzle/`, then `pnpm db:migrate`. New tables must call `.enableRLS()`, and drizzle-kit drops the SRID from geometry columns, so fix those to `geometry(point, 4326)` by hand.

**Which database to develop against**

- **Now (pre-launch):** the single hosted Supabase project is fine. There are no users, and migrations and seeds are safe to rerun.
- **Before public launch:** create a second free Supabase project (`curtainly-dev`; the free tier allows two) and point your local `.env` at it, keeping production for Vercel and the Ingest workflow.
- **Fully local (optional):** install Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development), run `supabase start`, and use `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Enable PostGIS with `create extension postgis with schema extensions;` before migrating.

## Infrastructure (free tiers)

- **Vercel** (Hobby): hosts `web/`. Move to Pro before affiliate links go live; Hobby is non-commercial only.
- **Supabase**: Postgres + PostGIS, admin auth. The daily ingest run keeps the project from pausing.
- **GitHub Actions**: CI and the daily `Ingest` workflow. Needs `DATABASE_URL` (and later `TICKETMASTER_API_KEY`) as repo secrets.
