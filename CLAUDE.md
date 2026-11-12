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
- Admin pages follow `web/src/app/admin/regions/page.tsx`: `requireAdmin()` → `parseListParams()` → rows + count query → `DataTable` + `Pagination` (components in `web/src/app/admin/_components/`). Forms: a Server Action returning `FormState` via `parseForm(zodSchema, formData)` (`web/src/lib/forms.ts`) with `Field` / `FormMessage` / `SubmitButton`. Server code gets the DB from `db()` in `web/src/lib/db.ts`.
- Slugs: `generateSlug` / `isSlugInUse` in `web/src/lib/slugs.ts`; form errors that keep typed values: `fieldError` in `web/src/lib/form-errors.ts`. List filters: `FilterSelect` inside `ListToolbar` (see `admin/companies/page.tsx`).
- New admin sections: add the nav entry in `_components/nav-items.ts`; drop its `issue` once a real page exists (the `[section]` placeholder route serves it until then).
- Geocoding: only through `geocodeAddress` in `shared/src/geocode.ts` (`@curtainly/shared/geocode`), which enforces Nominatim's 1 request/second limit and user agent. Never loop over addresses in parallel; never re-geocode an unchanged address.
- Colors: only tokens from `web/src/app/theme.css` (`var(--bg)`, `var(--accent)`…), never hex values in components or other CSS. New tokens go in theme.css and in `web/src/app/admin/theme/tokens.ts` (the `/admin/theme` preview). Keep AA contrast.
- PostGIS points use `mode: 'xy'`: x = longitude, y = latitude.
- Performance times are `timestamptz`; group and archive by the Region's `timezone`.
- Adapter contract lives in `ingest/src/types.ts`: `fetch(source) → RawItem[]`, `normalize(raw) → CandidateProduction[]`. Each adapter gets fixture-based tests.

## Workflow

- Work is tracked as GitHub issues under milestones M0–M5 (MVP), then Phase 2 and Phase 3. Labels: `area:*` for package, `type:*`, `decision` for open choices.
- Branch per issue (`<issue#>-short-name`), PR into `main`, reference the issue with `Closes #N`.
- Kanban board: the [Curtainly project](https://github.com/users/TonyQ032/projects/4) (views: Board, By milestone, Decisions). Status flow: Backlog → Ready (current milestone) → In progress (branch cut) → In review (PR open) → Done (merged or closed). When starting or opening a PR for an issue, move its card with `gh project item-edit`.

## Working on this repo

- **One ticket per session.** Start a fresh session in this folder with "start on #N". Tickets that don't depend on each other can run in parallel sessions, each in its own worktree; dependent ones (e.g. #15 after #13 and #14) wait for the merge.
- **Worktrees:** keep the main checkout on `main`; each ticket gets its own worktree. Claude Code copies the root `.env` into new worktrees via `.worktreeinclude` (it stays gitignored; never commit it). In a new worktree, run `pnpm install` first. Tag test rows with the ticket (`Zz Test #N …`) so parallel sessions don't delete each other's data; a second dev server falls back to the next free port. After merging, remove the worktree (`git worktree remove <path>`) and its local branch.
- **Merging:** once a PR is open, ask the owner whether to merge. The usual answer is "merge when green": squash-merge with `--delete-branch` once all checks pass, sync local `main`, and confirm the issue closed and its card is in Done.
- **Test against the real database** in the browser pane, using throwaway rows named `Zz Test …`. Delete them afterwards with a one-off script and report what remains; never leave test data behind. Cover the error paths too (validation, duplicate slug, values kept after an error).
- **Stale dev server:** if a page shows old code or a hydration mismatch after editing shared components, stop `pnpm dev`, run `rm -rf web/.next`, and restart. Stop the dev server when the work is done.
- **Secrets and sign-in stay with the owner.** They add secrets and env vars through the GitHub and Vercel websites, and sign in to `/admin` in the browser pane themselves. Never ask for secret values in chat, never type the password, and mask passwords when inspecting `.env`.
- **Vercel env vars set so far:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ADMIN_EMAILS`. Admin pages that read the database also need `DATABASE_URL` (Supabase transaction pooler, port 6543); the owner was asked to add it, but it hasn't been confirmed.
