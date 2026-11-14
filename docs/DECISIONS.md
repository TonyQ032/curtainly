# Decisions

Changes to, and clarifications of, [PLAN.md](PLAN.md). Newest first. PLAN.md stays the original plan; this log records what changed and why.

## 2026-11-13: Non-show filter rules (#26)

**A rule is a keyword or phrase matched as whole words in the candidate's title**, after `normalizeKeyword` (lowercase, accents and punctuation removed, `&` as "and"; unlike `normalizeTitle`, nothing is dropped). Rules live in `filter_rules`, global when `source_id` is null, unique per scope and keyword. Only the title is matched: it's the one text field every adapter provides, and we don't store descriptions.

**Filtered candidates are dropped before dedup**, counted per source (`filtered` in the run outcome and summary) and logged with their titles and the matching keyword, so a rule that's too broad shows up in the Actions log. They never touch the queue. If rules fail to load, the run filters nothing; review still catches non-shows.

**Global rules are seeded by the migration and kept conservative**: gala, fundraiser, audition(s), acting class(es), masterclass, summer/theatre/theater/drama camp, staged reading, play reading, reading series, improv, open mic, gift card, gift certificate, season subscription, flex pass, parking, donation. Single words that are also show titles ("Master Class", "Camp Rock", "Workshop") are left to per-source rules, because a false positive drops a real show without anyone seeing it in the queue.

**"Not a show" can add a rule for the source.** The form proposes a keyword found in the title (from a list of common non-show words) and the reviewer can change or clear it; it must occur in the item's title and be at least 3 letters. A source rule repeating a global one isn't added. The key-based suppression from #25 still applies with or without a keyword.

**Adding a rule closes the pending items it matches** (same source, or every source for a global rule) as `not_a_show`: the runner never sees filtered candidates again, so those items would otherwise stay pending forever. Removing a rule doesn't reopen anything.

**`/admin/filter-rules`** lists rules (filter by scope, search by keyword), adds global or per-source rules, and removes them. It sits next to the review queue in the nav.

## 2026-11-13: Review item detail and actions (#25)

**Detail page at `/admin/review/[id]`** shows the proposed production beside the raw payload, the diff for updates, and Work matches. Matches for pending new items are recomputed when the page loads, so a Work created while working through the queue shows up; reviewed items keep what was stored. Every action records the reviewer's email and time, and moves on to the next pending item.

**Approve.** An update applies its stored diff (`applyProductionDiff`). A new item needs a Work (a suggestion, preselected when the title or an alt title matches, or a new Work with a type), a venue (preselected by name, else the company's latest venue) and publish or draft; publishing is refused for out-of-scope companies. A new Work whose normalized title already exists is refused, and so is a production overlapping one of the same company and Work, with a pointer to Merge.

**Edit then approve reuses the production form**: `/admin/productions/new?review=<id>` or `/admin/productions/<id>?review=<id>` prefill it from the item (an update's diff applied to the current values), and saving approves the item in the same transaction.

**Merge only adds.** Merging a new item into an existing production of the same company applies the diff against that production without removing performances, since a source listing is often partial. It marks the item `merged`.

**The source's title is learned.** When approving or merging links a title to a Work under a different name, the title is added to the Work's alt titles, so the next run dedups to the production instead of queueing it as new again.

**Rejected and "not a show" items stop re-queueing** (settles the open point from #23). The runner skips a candidate key that the source's reviewer marked `not_a_show` (a new `review_status` value), for good. A rejected proposal isn't queued again until what the source lists changes. Skipped entries are counted as `dismissed` in the run summary. Keyword rules for non-show events stay with #26.

**Dates only widen.** `applyProductionDiff` now takes the earlier start and later end of the production and the diff, so a diff approved after the production changed can't shrink its run.

## 2026-11-13: Review queue list (#24)

**"Type" is new or update**, derived from `review_items.production_id`; "Source" filters by source kind (Ticketmaster, JSON-LD, Public submission…). The list shows pending items only, newest first by `created_at`.

**Error reports join the list when #56 builds them.** Reports stay in their own `reports` table (they point at a production, not a proposed one) and will appear here as a third type, "Report", rather than being copied into `review_items`.

**The nav shows the pending count** next to "Review queue", queried in the admin layout. Layouts persist across client navigation, so the review actions (#25) revalidate the admin layout to keep it current.

## 2026-11-13: Writing candidates to the review queue (#23)

**One pending item per source and candidate key.** `review_items.candidate_key` is the upstream id (`external:<id>`) or, without one, the normalized title (`title:<…>`). A partial unique index on `(source_id, candidate_key) where status = 'pending'` lets reruns upsert: the pending item is rewritten only when what the reviewer sees changed (proposed production, diff, linked production, Work suggestions). A raw-payload-only change, such as seats left, doesn't touch it. A key-based item also moves from "new" to "update" in place if the production gets created by other means.

**Candidates that point at the same production are merged before diffing**, and so are candidates sharing a key. Platforms often list a run as one event per week or per performance; diffed one by one, each piece would propose removing the others' performances. The merged item keeps every raw item in `payload` (always an array).

**Stale items are cleared.** When a candidate now matches its production with nothing to change (the production was edited to match, or the source reverted), that source's pending items for the key or production are deleted. Items are never cleared just because a candidate is missing from a run, since a bad scrape would empty the queue.

**Auto-approve publishes updates only.** For a source with `auto_approve`, an update's diff is applied directly (`applyProductionDiff` in `@curtainly/shared/db/apply-diff`, which #25 reuses for manual approval) and logged as an `approved` ReviewItem with reviewer `auto-approve`. New productions still go to the queue, because they need a Work and a venue picked by a person. This follows the plan ("its updates then publish directly"); #27 adds when a source earns the flag.

**Work suggestions are stored for new items only** (`match_suggestions`, now the full `WorkMatch` with `kind` and `matchedTitle`); an update's Work is already known. Works are loaded once per run.

**Open for #25:** a rejected item doesn't stop the same candidate from being queued again on the next run. Whether rejection should suppress a key (and for how long) is decided with the review actions and the "not a show" rule (#26).

## 2026-11-12: Dedup and update diffs (#22)

**Same Work means the candidate's normalized title equals the Work's normalized title or one of its alt titles**, not a fuzzy match. Dedup runs unattended, so a fuzzy hit could silently merge two different shows; anything less than an exact match becomes a new item, and the reviewer sees the fuzzy Work suggestions there. Dates overlap when the candidate's first-to-last performance (as local dates in the venue Region's timezone) shares a day with the production's run. If several productions match, the one sharing the most days wins. A candidate with no performances never matches.

**Diffs compare upcoming performances only** (at or after the run time), because sources drop past performances from their listings. Prices, ticket URL, advisory and runtime are proposed when the candidate has a value that differs; a value the candidate leaves out is never proposed as cleared. New dates are proposed only when performances run outside the production's dates. Venue isn't compared: source venue names rarely match ours word for word, and a noisy diff would queue an item every run.

**The diff is stored in a new `review_items.diff` column** (`ProductionDiff` in `@curtainly/shared`), next to `production_id`. An empty diff means unchanged: no ReviewItem. Dedup lives in `shared/src/production-diff.ts` so the review detail page (#25) can render and apply the same type.

**The runner loads each company's productions ending in the last 365 days or later** once per source, and logs new / update / unchanged counts. Writing the items is #23.

## 2026-11-12: Work matching (#21)

**Matching runs in memory, not with `pg_trgm`.** `suggestWorks(title, index)` in `@curtainly/shared` scores Works against a candidate title; `buildWorkIndex(works)` precomputes normalized titles and trigrams so the runner builds it once per run. The registry will hold a few thousand Works at most, so this needs no extension, migration or round trip per candidate, and it is unit-tested without a database. Revisit if Works grow past tens of thousands.

**Scores are rule-based first, trigram second**, so the reviewer sees why something matched: exact normalized title 1.0, alt title 0.98, equal after dropping a subtitle ("Hamilton: An American Musical") 0.9, one title's words inside the other ("Disney's Beauty and the Beast") 0.6–0.88 by coverage, and otherwise pg_trgm-style trigram similarity capped at 0.85. Each Work appears once (its best title or alt title); the default is the top 5 scoring at least 0.3. Titles under 4 characters don't match by containment.

## 2026-11-12: Ingest runner (#20)

**Sources gain `last_items_at`**: the last successful run that returned at least one item. The "zero items for 3+ days when it normally returns items" rule needs it; `last_success_at` can't serve, because it advances on zero-item runs too.

**Source failures don't fail the job.** The Actions run exits 0 when individual sources fail; that is recorded as source health and shown in the run summary. It exits 1 only when the run itself can't proceed (database unreachable, unknown `INGEST_SOURCE_ID`).

**`INGEST_SOURCE_ID` runs that source even when it is disabled**, so a source can be tried before it is switched on. `manual` and `submission` sources are never run.

**Up to 4 sources run at once.** Per-host politeness is enforced by the shared polite fetch, so parallel sources on the same platform still queue behind each other.

## 2026-11-12: San Diego registry seed (#16)

**78 companies, not 100–140.** The seed lists only companies confirmed active in 2026 and in scope: 52 in scope and active (12 professional, 16 indie & fringe, 13 community, 11 college), 5 in scope but inactive, and 21 excluded. The 100–140 estimate assumed more small community groups than the research turned up. Data is in `shared/src/db/seed-data/san-diego-companies.ts`; sources are listed in its header.

**Excluded orgs are rows with `in_scope = false`**, with the reason at the start of `notes` ("Excluded: youth-only"). Closed companies (SD Rep, Ion, OB Playhouse & Theatre Company) also get `active = false`. Keeping them in the registry stops them from being re-added and lets coverage show them as excluded.

**In scope but `active = false`** when no 2026 activity was found and the website is gone: Intrepid, Common Ground Theatre, SDAART, Wildsong, Welk Resorts Theatre. Check these before switching the region to `live`.

**Ticketing platform lives in the seed file and in `notes`, not in a column.** Read from each company's ticket links, so M3 can plan adapters without a schema change. Among the 52 active companies: Arts People 7, Spektrix 4 (Cygnet, Lamb's, North Coast Rep, New Village Arts; all on `purchase.<domain>`, and Spektrix has a public events API), ThunderTix 3, OvationTix 2, Tessitura (unverified) 2, Ticketmaster, AudienceView Unlimited, VBO, TicketOwl, Humanitix 1 each, plus a long tail of small tools (OnTheStage, Zeffy, Ticket Tailor, TicketLeap, Givebutter, Wix Events, Eventbrite), 11 college box offices and 8 unknown.

**Mosaic Theatricals is the renamed CCAE Theatricals**, so it's one company.

**Venues are not seeded.** Each company's usual venues are noted for reference; Venue rows (and their geocoding) happen as productions are entered.

**Reseeding never overwrites** (matched by slug), so admin edits survive. Changing seed data later only affects new databases.

**Leads not added (couldn't confirm they're active or in scope):** Uprise Theatre, Chalk Circle Collective, Poway Performing Arts Company, American History Theater, Mira Mesa Theatre Guild, Village Church Community Theater (Rancho Santa Fe), Cal State San Marcos theatre, East County Performing Arts Association (Julian), Arms Wide Open (El Cajon), Lyric Opera San Diego (would be excluded as opera), Mystery Cafe. Temecula's The Merc is inside the 45-mile radius but outside the county; decide when the region boundary is refined.

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
