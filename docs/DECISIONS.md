# Decisions

Changes to, and clarifications of, [PLAN.md](PLAN.md). Newest first. PLAN.md stays the original plan; this log records what changed and why.

## 2026-11-12: Manual production entry (#15)

**Performances are entered in the venue's local time.** The form shows and accepts date + time in the timezone of the production venue's Region, and converts with `zonedToUtc` / `utcToZoned` in `@curtainly/shared` (plain `Intl`, no date library). Adapters should use the same helpers. A time skipped by a DST change moves one hour later; a repeated time takes the first instance.

**Saving matches performances by start time.** Removed rows are deleted, new ones inserted, and rows at an unchanged time keep their id and get their venue and notes updated. A performance whose venue equals the production's venue is stored with no override.

**Run dates can come from the performances.** Leaving the first or last date blank fills it from the earliest or latest performance. Typed dates must contain every performance, so a draft can still be saved with dates only (times not announced yet).

**Rules enforced on save:**

- **Same company + same Work + overlapping dates is refused**, with a link to the existing production (the plan's identity rule, applied to manual entry too).
- **Publishing needs at least one performance** (browse is ordered by next performance) **and an in-scope company** (scope is by producer).
- **`archived` can't be set by hand.** It's for the automatic archive after the end date; an archived production keeps the option so it can be re-saved.

**New works can be created from the production form** with just a title and type. If the title matches an existing Work (normalized title, or an alt title), the form lists the matches and asks for confirmation, as on the Works page. Credits and alt titles are added on the Work's page afterwards.

**Bulk add is a weekly schedule**: weekdays + a time per line (default Thu–Sat 7:30 PM and Sat–Sun 2 PM) between two dates, merged into the list without duplicates. Capped at 400 performances per production and a two-year span.

## 2026-11-12: Works admin (#13)

**Duplicate check is a warning, not a block.** Saving a Work looks for other Works whose `normalized_title` equals the normalized title or any alt title being saved, or whose alt titles match one of those titles (ignoring case). If any exist, the form lists them and asks the admin to tick "It's a different work. Save anyway." Two different shows can share a title, so this can't be a unique constraint. On edit, only titles new to the Work are checked, so an accepted duplicate doesn't warn on every save.

**Credits keep the plan's shape** (`playwright`, `book`, `music`, `lyrics`, plus `other: { role, names }[]`). The editor merges rows for the same role, and display merges roles held by the same people ("Music & lyrics: Stephen Sondheim") via `creditLines` in `@curtainly/shared`.

**Alt titles skip editions.** "JR.", "The Musical", "Youth Edition" and similar already normalize to the base title, so they don't need to be listed.

## 2026-11-11: Geocoding with Nominatim (#17)

**Nominatim (OpenStreetMap's public geocoder), not Mapbox.** Free, no account or API key, and our volume is tiny: one lookup when a venue is saved, a few hundred venues in total. It follows the [usage policy](https://operations.osmfoundation.org/policies/nominatim/):

- **Rate:** at most 1 request per second, enforced in `shared/src/geocode.ts` per process. Bulk seeding (#16) must go through the same function, one venue at a time.
- **Caching:** results are stored on the venue. An address is looked up again only when it changes, or when both coordinates are cleared on purpose.
- **Identity:** requests send `INGEST_USER_AGENT`, falling back to `CurtainlyBot/0.1 (+repo URL)`. Never a stock library user agent, and never personal details.
- **Attribution:** "© OpenStreetMap contributors (ODbL)" is shown next to coordinates in the admin. The public map (M4) must show it too.
- **Off switch:** setting `GEOCODER=off` stops all lookups without a deploy. Venues can still be saved with typed coordinates.
- No autocomplete and no systematic queries: both are banned by the policy.

**Lookups happen inside the save request**, so a save waits about a second for the lookup. That's fine for one venue at a time; revisit if saves feel slow.

**Results are restricted to the US** (`countrycodes=us`), and a match farther from the region's center than its radius is saved but flagged. That usually means a wrong match or a typo. Typed coordinates always win over a lookup.

## 2026-11-11: Theater color theme (#79)

**Plain CSS with tokens in one file.** All colors live in `web/src/app/theme.css`: a raw palette (curtain reds, brass, velvet darks, playbill paper) and semantic tokens built from it. This settles the color part of #42; typography and spacing stay open there.

**One definition per token, both themes side by side**, using CSS `light-dark(<light>, <dark>)`. Next compiles it (Lightning CSS) into a fallback driven by helper variables that it adds wherever `color-scheme` is set _in CSS_. So themes are switched only through CSS rules (`data-theme` on `<html>`, or the `.scheme-light` / `.scheme-dark` classes), never an inline `color-scheme` style.

**System theme by default, Light / Dark / System toggle.** The choice is stored in `localStorage` (`curtainly-theme`) and applied by a tiny inline script in `<head>` before first paint, so there's no flash of the wrong theme. No cookie, so pages stay cacheable.

**Contrast:** text tokens are at least 4.5:1 and UI outlines and the focus ring at least 3:1 against their backgrounds in both themes (WCAG AA). Error red sits close to the accent red; errors always carry text, not color alone.

## 2026-11-11: Admin login (#7)

**Email + password via Supabase Auth, single admin, sign-ups disabled.** The admin user is created in the Supabase dashboard; public sign-ups are turned off in Supabase. Password login needs no redirect-URL or email setup (magic links would need both, and Supabase's built-in email is heavily rate-limited). Could switch to magic link or GitHub OAuth later without schema changes.

**Two layers of checks.** `web/src/proxy.ts` (Next 16's renamed middleware) refreshes the session and redirects non-admins away from `/admin/*` using verified JWT claims. It is only a pre-filter: `requireAdmin()` in `web/src/lib/auth.ts` verifies the user with Supabase Auth and checks the `ADMIN_EMAILS` allowlist, and every admin page, Server Action and Route Handler must call it.

**Allowlist fails closed.** An empty or unset `ADMIN_EMAILS` means nobody gets in, even with a valid Supabase account.

**Publishable key naming.** Env var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current key type); the legacy anon key works in the same variable.

**One env file.** `next.config.ts` loads the repo-root `.env` in local dev, so `web/.env.local` isn't needed.

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
