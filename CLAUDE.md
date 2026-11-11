# Curtainly: notes for Claude

Long-term side project: one site listing every in-scope play and musical near a location, starting with San Diego County. Read [docs/PLAN.md](docs/PLAN.md) for the full product and technical plan and [docs/DECISIONS.md](docs/DECISIONS.md) for what has changed since. When a decision changes the plan, add an entry to DECISIONS.md rather than editing PLAN.md.

## Non-negotiables from the plan

- **Scope is by producer.** A Company's `in_scope` decides inclusion for all its productions. Out: youth-only orgs, K-12 schools, student clubs, festivals as events, readings, improv, stand-up, opera, dance.
- **Humans review automated data.** Adapters and submissions write ReviewItems; nothing goes straight to published unless the source has `auto_approve` (and even then it is logged to the queue).
- **Facts, not copy.** Store title, company, venue, dates, times, prices, ticket URL, advisories. Never copy description text or photos. Images only with recorded permission.
- **Scrapers are polite.** Respect robots.txt, identify with `INGEST_USER_AGENT`, cap requests per host, cache responses. Check a platform's terms before enabling its adapter.
- **Neutral ordering.** Chronological by next performance. No featured or paid placement; affiliate links never affect ranking.
- **Near-zero cost.** Free tiers ($0–25/month). Vercel Hobby until affiliate links ship, then Pro.
- **Geography is location + radius.** Regions only switch to `live` once coverage is proven.

## Repo

pnpm workspace: `web/` (Next.js App Router), `ingest/` (adapters + runner, `tsx`), `shared/` (Drizzle schema in `shared/src/db/schema.ts`, migrations in `shared/drizzle/`, enums, `normalizeTitle`). `@curtainly/shared` ships TS source with no build step.

- Run `pnpm typecheck && pnpm lint && pnpm test` before committing; CI also runs `pnpm format:check` and `pnpm build`.
- Schema changes: edit `schema.ts`, then `pnpm db:generate`. drizzle-kit drops the SRID on geometry columns; fix the generated SQL to `geometry(point, 4326)`.
- Every table calls `.enableRLS()` with no policies so Supabase's public Data API can't touch data; app code connects as `postgres` and bypasses RLS.
- `pnpm db:migrate` reads `DATABASE_URL` from the root `.env` (Supabase session pooler URL, port 5432).
- Admin auth: every `/admin` page, Server Action and Route Handler calls `requireAdmin()` from `web/src/lib/auth.ts`. `web/src/proxy.ts` is only an optimistic pre-filter.
- PostGIS points use `mode: 'xy'`: x = longitude, y = latitude.
- Performance times are `timestamptz`; group and archive by the Region's `timezone`.
- Adapter contract lives in `ingest/src/types.ts`: `fetch(source) → RawItem[]`, `normalize(raw) → CandidateProduction[]`. Each adapter gets fixture-based tests.

## Workflow

- Work is tracked as GitHub issues under milestones M0–M5 (MVP), then Phase 2 and Phase 3. Labels: `area:*` for package, `type:*`, `decision` for open choices.
- Branch per issue (`<issue#>-short-name`), PR into `main`, reference the issue with `Closes #N`.
- Kanban board: the [Curtainly project](https://github.com/users/TonyQ032/projects/4) (views: Board, By milestone, Decisions). Status flow: Backlog → Ready (current milestone) → In progress (branch cut) → In review (PR open) → Done (merged or closed). When starting or opening a PR for an issue, move its card with `gh project item-edit`.
