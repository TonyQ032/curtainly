# Decisions

Changes to, and clarifications of, [PLAN.md](PLAN.md). Newest first. PLAN.md stays the original plan; this log records what changed and why.

## 2026-11-11: Supabase setup

**Row-level security on every table, no policies.** Supabase exposes the `public` schema through its Data API using the anon key, which is shipped to browsers. RLS with no policies blocks that API entirely. The web app and ingest connect with `DATABASE_URL` as the `postgres` role, which bypasses RLS, so all data access goes through our own server code. If the browser ever needs to query Supabase directly, add explicit policies for that case.

**Connection strings.** Migrations and GitHub Actions use the Supabase _session pooler_ (port 5432); the direct connection is IPv6-only and GitHub runners can't reach it. The Vercel app will use the _transaction pooler_ (port 6543); the client sets `prepare: false` for it.

**PostGIS is enabled from the Supabase dashboard** (in the `extensions` schema). Migration 0000 is a no-op there and only matters for other databases.

## 2026-11-11: Initial setup

**Hosting stays on Vercel Hobby (free) for now.** Vercel Hobby is for non-commercial use only, and affiliate links count as commercial. Plan: upgrade to Vercel Pro (about $20/month, inside the $0–25 budget) before the first affiliate link ships (Phase 2, Ticketmaster via Impact). A donation link alone is fine on Hobby. Tracked as an issue in Phase 2.

**Regions carry an IANA timezone** (`regions.timezone`, e.g. `America/Los_Angeles`). "Tonight", "This weekend" and auto-archiving all depend on local time, which a center + radius alone doesn't give.

**Region geometry is center + radius** for v1 (`regions.center`, `regions.radius_miles`). A boundary polygon can be added later if needed.

**Venue location is nullable** so a venue can be saved before geocoding succeeds. Browse queries skip venues without a location; the admin flags them.

**Sources have an `enabled` flag and `last_error`** in addition to the plan's fields, so an adapter can be switched off without deleting its config, and the health alert can show why a run failed.

**Review items link to the production they update** (`review_items.production_id`), which makes update diffs straightforward.

**Toolchain:** pnpm 10, TypeScript 6.0 (typescript-eslint doesn't support TS 7 yet), Next.js 16, React 19, Drizzle ORM with `postgres-js`, Vitest, ESLint 9 flat config, Prettier. `@curtainly/shared` ships TypeScript source (no build step); Next transpiles it and `ingest/` runs through `tsx`.

**PostGIS SRID workaround:** drizzle-kit currently drops the SRID from `geometry` columns when generating SQL. The initial migration was edited by hand to `geometry(point, 4326)`. Check this whenever a migration touches a geometry column.

## Open (to decide during build)

Tracked as issues with the `decision` label:

- Final product name and domain (before public sharing)
- Geocoding provider (Nominatim vs Mapbox free tier)
- Map library for the map toggle (e.g. MapLibre + free tiles)
- Auto-approval rule: count of reviewed items approved without edits, rather than runs (a quiet run is trivially "clean")
- "Between seasons" flag for companies, so coverage is defined one way (the dashboard's definition)
- Analytics: Vercel Web Analytics custom events need Pro, so track zero-result searches in our own table or use Umami
- Browse rendering: per-region payload regenerated with ISR and filtered by distance on the client, vs. server-side radius queries
- Ticketmaster API terms on storing data, not only display (read before M2 schema work is final)
