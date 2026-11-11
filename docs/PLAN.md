# Curtainly — Product & Technical Plan

Nov 11, 2026 · @Anthony

## Overview

Curtainly is one place to find every play and musical running near you (professional, indie, community and college), starting with San Diego County. Today no site lists all of it: Ticketmaster covers the big houses, BroadwayWorld relies on self-submission, and most community and college theatre is invisible outside each company's own website.

**Vision.** Search any location in the US (eventually the world) and see every in-scope live theatre production nearby, by date, with a link to buy tickets.

**Ambition level.** A side project, used first by the owner, then shared publicly once trustworthy. The goal is sustainability (covering its own running costs), not a business.

**Working name.** Curtainly ("certainly" + stage curtain). Temporary; a final name and domain are chosen before public sharing, avoiding any region-specific name.

**Success for v1.** For San Diego County, a user can answer "what plays and musicals are on in the next few weeks near me?" and trust that the list is essentially complete for in-scope companies.

## Scope

Scope is decided by **who produces the show**, not who is in it: if the producing organization is in scope, every production it mounts is listed, including youth-cast and family shows. One check per company, not per production.

|  | Included | Excluded |
| --- | --- | --- |
| Producers | Professional companies and touring houses; indie and fringe companies (regular seasons); community theatres; college and university theatre departments | Youth-only organizations (e.g. San Diego Junior Theatre); high schools and middle schools; student clubs and class showcases |
| Event types | Plays and musicals, including youth-cast and family shows by in-scope producers | Festivals as events (e.g. SD International Fringe), readings, improv, stand-up, opera, dance |
| Regions | San Diego County (v1), then Los Angeles, then any US location | Everything else until coverage criteria are met |

**Tiers** (used as a filter and on every company): Professional · Indie & fringe · Community · College.

**Expected registry size.** Roughly 100–140 producing organizations in San Diego County once schools and youth-only groups are removed.

Excluded genres stay possible later: the data model carries a type field so opera, dance or improv can be added without schema changes.

## Guiding principles

1. **Registry first.** A curated list of every in-scope company and venue is the foundation. Coverage = companies with current data ÷ companies in the registry, per region and tier.
2. **Humans review automated data.** Every ingested or submitted item lands in a review queue. Sources earn auto-approval after a track record.
3. **Facts, not copy.** Store title, company, venue, dates, times, price range, ticket URL, advisories. Blurbs are original or company-submitted; images only when provided or permitted. Scrapers respect robots.txt and rate limits.
4. **Link out, never sell.** Every production links to its official ticketing page. Affiliate links are fine; they never change ranking.
5. **Neutral ordering.** Chronological by next performance. No featured or paid placement. Affiliate disclosure in the footer.
6. **Near-zero cost.** Free tiers wherever possible (target $0–25/month) so the site never needs revenue to survive.
7. **Built for anywhere, launched in one place.** Geography is location + radius from day one; regions are switched on only when their coverage is proven.

## Architecture and tech stack

A TypeScript monorepo with a server-rendered Next.js site and a separate scheduled ingestion worker, both sharing one Postgres schema.

_(Architecture diagram: sources → ingest worker → review queue in Postgres → public site.)_

Every source feeds the ingest worker, which writes candidates to the review queue in Postgres; only approved items appear on the public site.

| Layer | Choice | Why |
| --- | --- | --- |
| Repo | Monorepo: `web/`, `ingest/`, `shared/` (pnpm workspaces) | One schema and one set of types for site and ingestion |
| Frontend + server | Next.js (App Router), React, TypeScript | Server-rendered, indexable pages for production, company, venue and work pages |
| Hosting | Vercel free tier | Zero cost at low traffic; incremental static regeneration for listings |
| Database | Supabase Postgres + PostGIS | Radius queries ("within X miles"); free tier |
| ORM | Drizzle | Type-safe schema in `shared/`, migrations in repo |
| Auth | Supabase Auth, admin only | No public accounts in v1 |
| Ingestion runtime | GitHub Actions cron, daily, running `ingest/` TypeScript jobs | Free, separate from the site, easy to rerun one adapter |
| Geocoding | A free geocoder (e.g. Nominatim or Mapbox free tier), run once per venue | Venues change rarely; store lat/lng |
| Analytics | Vercel Web Analytics or self-hosted Umami | Cookie-free, no consent banner |

**Package responsibilities**

- `shared/`: Drizzle schema, domain types, title normalization and matching utilities, tier and type enums.
- `ingest/`: one adapter per source platform, a runner that executes adapters for active sources, writes candidates to the review queue, and records source health.
- `web/`: public site (browse, search, detail pages, submit form, error reports) and the `/admin` area (review queue, registry, coverage dashboard).

## Data model

The core chain is **Work → Production → Performance**, with Company and Venue alongside, and Source and ReviewItem powering ingestion.

| Entity | Key fields | Notes |
| --- | --- | --- |
| Region | id, name, slug, boundary or center + radius, status (planned / building / live) | Drives "we don't cover this area yet" and coverage metrics |
| Company | id, name, slug, tier, region\_id, website, active, in\_scope, notes | The registry. `in_scope` decides inclusion for all its productions |
| Venue | id, name, slug, address, lat/lng (PostGIS point), region\_id, website | Geocoded once; a company may use many venues |
| Work | id, title, normalized\_title, alt\_titles\[\], type (play / musical / other), authors (book, music, lyrics, playwright) | The show itself; enables "where is *Into the Woods* playing?" |
| Production | id, work\_id, company\_id, venue\_id, start\_date, end\_date, price\_min/max, ticket\_url, advisory, runtime\_min, blurb, image\_url + permission flag, family\_friendly, status (draft / published / cancelled / archived) | One company's run of a work. Main browse unit |
| Performance | id, production\_id, starts\_at (timestamptz), venue\_id override, notes | Date and time only; no live availability |
| Source | id, company\_id, kind (ticketmaster / ovationtix / arts\_people / thundertix / vbo / jsonld / custom / manual / submission), config (JSON), auto\_approve, last\_run\_at, last\_success\_at, last\_item\_count, health | One row per way data reaches a company |
| ReviewItem | id, source\_id, payload (raw), proposed changes, match suggestions, status (pending / approved / rejected / merged), reviewer, timestamps | Every automated or submitted change passes through here |
| Lead | id, company\_id?, work\_title, dates?, origin (mti / trw / report), status | Phase 2 hints to verify, never published directly |
| Report | id, production\_id, message, contact?, status | "Report an error" submissions |

**Duplicate and identity rules**

- A production is the same production when it has the same company + the same Work + overlapping date ranges.
- Titles are normalized (case, punctuation, "The", subtitles like "The Musical", "Youth Edition", "Jr.") before fuzzy-matching against Work titles and alt titles; the review queue shows the top suggestions and the reviewer confirms or creates a new Work.
- Re-ingesting an approved production updates it in place (new performances, changed prices) as a diff in the queue, not a new record.
- Productions whose end date has passed are archived automatically: hidden from browse, kept on company, venue and work pages.

## Ingestion

Each company in the registry has one or more Sources; each Source uses an adapter matched to the platform it sells tickets on. Adapters run daily on GitHub Actions and write candidates to the review queue, never straight to the live site.

**Adapter contract** (in `ingest/`): `fetch(source) → RawItem[]` then `normalize(raw) → CandidateProduction[]` (title, company, venue, performances, prices, ticket URL). The runner dedups candidates against existing productions, creates or updates ReviewItems, and records run health on the Source.

| Adapter | Covers (San Diego examples) | Method | Priority |
| --- | --- | --- | --- |
| Ticketmaster | Broadway San Diego, Civic and Balboa Theatres | Discovery API / Discovery Feed (free key; 5,000 calls/day) | MVP |
| OvationTix (AudienceView Professional) | Moxie, Diversionary | Public per-client API (needs each client ID) | MVP |
| Arts People | Lamplighters, Trinity, Coronado Playhouse | Scrape public event pages | MVP |
| ThunderTix | Scripps Ranch Theatre | Scrape public event pages | MVP |
| VBO Tickets | Oceanside Theatre Co. | Scrape public event pages | MVP |
| Generic JSON-LD | Any site emitting schema.org Event / TheaterEvent | Parse structured data | MVP |
| Custom (per site) | Old Globe, La Jolla Playhouse, Lamb's Players, North Coast Rep | Site-specific scraper | MVP |
| Manual | Anything without an automatable source | Admin form | MVP |
| Submission | Any company | Public "Submit a show" form | MVP |
| Licensing-house leads | Community productions of licensed musicals | MTI / TRW "productions near you" pages, gentle crawl, terms checked first; creates Leads only | Phase 2 |

**Rules for every adapter**

- Respect robots.txt, identify with a clear user agent, cap requests per host, cache responses.
- Extract facts only (see principles); never copy description text or photos.
- Filter out non-show events (galas, classes, camps) by rule where possible; everything else is caught in review.
- A run that errors or returns zero items for a source that usually has items marks the source unhealthy (see Admin).

**Self-submission.** A public form, no account: company, title, venue, dates and times, price range, ticket URL, optional blurb and image with a permission checkbox, and contact email. Submissions become ReviewItems. A "Report an error" link on every production feeds Reports into the same queue.

**Auto-approval.** After a source produces about 10 consecutive clean runs with no reviewer edits, it can be flagged `auto_approve`; its updates then publish directly but still log to the queue for audit.

## Admin, review and coverage

The `/admin` area, behind Supabase Auth, is where the owner keeps the data complete and correct. It ships in the MVP, before the public browse UI.

**Review queue**

- One list of pending ReviewItems from adapters, submissions and error reports, newest first, filterable by source and type.
- Each item shows the raw payload beside the proposed production, a diff for updates, and Work match suggestions (top fuzzy matches by normalized title).
- Actions: approve, edit then approve, merge into an existing production, reject (with reason), or mark the source's item as "not a show" so the rule learns it.

**Registry management**

- Create and edit Companies (tier, in\_scope, region), Venues (geocode on save), Works, and Sources (kind, config, auto\_approve).
- Manual production entry form for companies with no automatable source.

**Coverage dashboard**

- Coverage % per region and tier = in-scope active companies with at least one upcoming published production, or confirmed "between seasons", ÷ in-scope active companies.
- **Source health alert:** any source whose last run failed, or that returned zero items for 3+ days when it normally returns items.
- **Staleness alert:** any active in-scope company with no upcoming production in the next 90 days, so the owner checks whether data is missing or the company is dark.
- Top "no results" searches from analytics (location + filters), as a list of coverage gaps.

## User experience

Mobile-first, no account needed. People choose *when* first, then *what*, then *where*, so the default view is a date-grouped list.

**Location**

- "Use my location" (browser geolocation) or a typed city / ZIP; the choice is remembered in localStorage.
- Outside a live region: "We don't cover this area yet. We currently cover San Diego County." Never a silently empty list.

**Browse (home)**

- Productions grouped by Tonight / This weekend / Next 2 weeks / Coming up, sorted by next performance.
- Card: title, company, venue + distance, date range, next performance, price range, tier badge, family-friendly badge.
- Map view as a toggle (venue pins), not the default.

**Filters (v1)**

| Filter | Values |
| --- | --- |
| Date range | Presets above + custom range |
| Distance | 5 / 10 / 25 / 50 miles |
| Type | Musical / Play / Other |
| Tier | Professional / Indie & fringe / Community / College |
| Price | Free / Under $25 / Under $50 / Any |
| Family-friendly | On / off |

**Search.** Title search over Works (with alt titles) and Companies, plus venue names. A title result leads to the Work page.

**Pages**

| Page | Contents |
| --- | --- |
| Production | Title (links to Work), company, venue with address and map link, date range, full performance list, price range, advisory and runtime when known, author credits, blurb, image if permitted, **Get tickets** link out, Add to calendar (.ics and Google) per performance, Report an error, schema.org `TheaterEvent` JSON-LD |
| Company | Tier, website, venues used, upcoming productions, archive of past productions |
| Venue | Address, map, upcoming productions at this venue, archive |
| Work | Credits, type, every upcoming production near the user, past productions |
| Submit a show | Public form feeding the review queue |
| About / coverage | What Curtainly covers, which regions are live, how to submit, affiliate disclosure, donation link |

## SEO, analytics, monetization and legal

**SEO.** Server-rendered Production, Company, Venue and Work pages with clean slugs (e.g. `/sd/productions/into-the-woods-lamplighters-2027`), `TheaterEvent` JSON-LD on every production for Google's event results, a sitemap regenerated daily, and canonical URLs per production.

**Analytics.** Cookie-free (Vercel Web Analytics or Umami). Track page views, outbound ticket clicks per production, and searches that return nothing (location + filters) as a coverage-gap signal. No personal data stored.

**Monetization**

- Running costs target: $0–25/month (domain, any paid tier upgrades).
- At launch: a donation link (Ko-fi or Buy Me a Coffee).
- Once there is real traffic: apply to the Ticketmaster affiliate program (via Impact). Expect affiliate links only on big-venue shows; small platforms have no programs.
- No display ads and no paid placement in v1. Affiliate links never affect ordering; disclosure in the footer.

**Legal and content posture**

- Facts (dates, times, venues, prices) only; no copied descriptions or production photos.
- Images only when a company submits them or gives permission (recorded on the production).
- Scrapers obey robots.txt and rate limits; review each platform's terms before enabling its adapter.
- Check Ticketmaster Discovery API terms for display requirements (attribution, link format).
- Check MTI and TRW terms before any licensing-house crawl; if disallowed, drop that source.
- A takedown and correction contact on the About page.

## Roadmap

The MVP is done when about 30 San Diego professional, indie and community companies have current data and the owner uses Curtainly daily. Phases are gated by coverage, not dates.

_(Roadmap diagram: MVP → MVP coverage gate → Phase 2 → 90% gate → Phase 3 (LA) → Later.)_

The diamonds are coverage gates: the MVP gate unlocks public launch work, and the 90% gate unlocks Los Angeles.

**MVP milestones** (each a ticketable epic, in build order)

1. **M0 Foundations.** pnpm monorepo, TypeScript config, Next.js app on Vercel, Supabase project with PostGIS, Drizzle schema + migrations in `shared/`, CI (typecheck, lint, test).
2. **M1 Registry and admin shell.** Supabase Auth admin login; CRUD for Regions, Companies, Venues (geocode on save), Works, Sources; manual production entry; seed the San Diego registry (100–140 companies, tier and in\_scope set).
3. **M2 Ingestion framework and review queue.** Adapter interface, runner, GitHub Actions daily cron, ReviewItem creation, title normalization and Work matching, dedup and update-diffs, source health recording.
4. **M3 MVP adapters.** Ticketmaster, OvationTix, generic JSON-LD, Arts People, ThunderTix, VBO, and custom adapters for Old Globe, La Jolla Playhouse, Lamb's Players and North Coast Rep.
5. **M4 Public site.** Location input, date-grouped browse, filters, map toggle, search, Production / Company / Venue / Work pages, JSON-LD, add-to-calendar, archive handling.
6. **M5 Feedback loop and launch readiness.** Submit-a-show form, Report an error, About / coverage page, analytics with no-result tracking, coverage dashboard with source health and staleness alerts.

**Phase 2: complete San Diego**

- Add college and university department productions to the registry and sources.
- Licensing-house Leads (MTI, TRW) after a terms check.
- Choose the final name and domain; share publicly.
- Contact the San Diego Performing Arts League with a working demo.
- Apply to the Ticketmaster affiliate program once traffic exists; add donation link.

**Phase 3: Los Angeles** starts only when San Diego holds 90%+ registry coverage for professional and community tiers and the staleness dashboard has been green for 30 days. LA begins with seeding its registry from directories and award lists, then adapters.

**Later.** User accounts with follows and alerts; "claim your company" logins; more genres (opera, dance, improv); national expansion region by region.

## Risks and open items

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scrapers break when small ticketing platforms change markup | Silent data gaps | Source health alerts, per-adapter fixtures and tests, review queue catches oddities |
| Long tail needs manual entry | Owner time | Producer-based scope keeps registry to \~100–140; submission form; staleness alerts target effort |
| Platform or licensing-house terms forbid scraping | Lose a source | Check terms before enabling; fall back to submissions or manual entry |
| Ticketmaster API display terms | Rework of TM listings | Read terms during M3 before building UI around TM data |
| Duplicate or mismatched productions | Trust damage | Work matching in review, company + work + date-overlap rule |
| Affiliate income only covers hosting | Low revenue | Acceptable for a sustainability goal; keep costs near zero |
| Free-tier limits (Supabase pausing inactive projects, Vercel limits) | Downtime | Daily cron keeps DB active; monitor usage; upgrade only if needed |

**Open items to decide during build**

- [ ] Final product name and domain (before public sharing).
- [ ] Geocoding provider (Nominatim vs Mapbox free tier).
- [ ] Map library for the map toggle (e.g. MapLibre + free tiles).
- [ ] Exact auto-approval threshold per source.
- [ ] Whether companies "between seasons" need an explicit flag to count as covered.

## Appendix: San Diego source research

Only Ticketmaster offers real cross-organization discovery, and it covers only the big touring houses; most local companies sell through small platforms without public APIs. Findings are from web research in November 2026; items marked unverified need a check during M3.

**Ticketing platforms seen in San Diego**

| Platform | San Diego users seen | Public discovery API or feed |
| --- | --- | --- |
| Ticketmaster | Broadway San Diego, Civic and Balboa Theatres | Yes: Discovery API (5,000 calls/day, 5 req/s) and Discovery Feed 2.0; affiliate program via Impact |
| AudienceView Professional (OvationTix) | Moxie, Diversionary | Per client: public events endpoint with a client ID header |
| AudienceView Unlimited | San Diego Musical Theatre | None found (vendor unverified) |
| Arts People | Lamplighters, Trinity, Coronado Playhouse | None found |
| ThunderTix | Scripps Ranch Theatre | None found |
| VBO Tickets | Oceanside Theatre Co. | None; organizers add schema markup by hand |
| TicketOwl | OnWord / Light Box | Unknown |
| Self-hosted (likely Tessitura, unverified) | Old Globe, La Jolla Playhouse, Lamb's Players, North Coast Rep | No public discovery API |
| Moonlight box office (City of Vista) | Moonlight Amphitheatre / AVO Playhouse | None |
| Eventbrite | Some small groups (unverified) | Public event search shut down Dec 2019 |

**Existing listing sites**

- **BroadwayWorld San Diego:** the most complete, self-submitted, no feed.
- **San Diego Performing Arts League:** runs ArtsTix and San Diego Theatre Month (about 27–30 member organizations); no public member list or API; potential partner.
- **KPBS events calendar, Times of San Diego, Vanguard Culture, San Diego Story:** curated or editorial, incomplete, no feeds.
- **TodayTix:** no San Diego market found. **Goldstar:** inactive.
- San Diego Rep suspended productions in 2023 and is described as closed; leave it out of the registry.

**Registry seed examples (in scope)**

- Professional: Old Globe, La Jolla Playhouse, Broadway San Diego, Cygnet, Lamb's Players, North Coast Rep, Moonlight Stage, San Diego Musical Theatre, Diversionary, Moxie, New Village Arts, Welk Resort Theatre.
- Indie and fringe: Backyard Renaissance, Roustabouts, OnWord, Oceanside Theatre Co., Trinity Theatre Co.
- Community: Coronado Playhouse, Lamplighters, Scripps Ranch Theatre, Point Loma Playhouse, Patio Playhouse, Poway Performing Arts Co.
- College: SDSU, UC San Diego, University of San Diego, Grossmont College, MiraCosta College.

**Expansion sources:** MTI and Theatrical Rights Worldwide publish per-show "productions near you" pages (no API; terms to check). Artsdata.ca is a model of an open arts-events knowledge graph worth studying.

**Sources**

- [Ticketmaster Discovery API: getting started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/)
- [Ticketmaster Discovery Feed](https://developer.ticketmaster.com/products-and-docs/apis/discovery-feed)
- [OvationTix public API](https://api.ovationtix.com/public)
- [Spektrix API v3](https://integrate.spektrix.com/docs/API3)
- [Eventbrite search API shutdown](https://groups.google.com/g/eventbrite-api/c/FT2MsDswdrA)
- [VBO event schema markup](https://www.vbotickets.com/blog/increase-visibility-google-event-schema-markup)
- [Times of San Diego: plays this week](https://timesofsandiego.com/things-to-do/2026/01/22/seven-plays-this-week-in-san-diego/)
- [BroadwayWorld San Diego listings](https://www.broadwayworld.com/san-diego/regionalshows.cfm)
- [San Diego Theatre Month announcement](https://www.broadwayworld.com/san-diego/article/Performing-Arts-Organizations-Unite-for-San-Diego-Theatre-Month-20240229)
- [KPBS event submission](https://www.kpbs.org/events/submit/)
- [San Diego Rep notice](https://www.sdrep.org/news_detail.php?id=210)
- [Cause IQ: San Diego theater nonprofits](https://www.causeiq.com/directory/theaters-list/san-diego-chula-vista-carlsbad-ca-metro)
- [MTI productions map example](https://www.mtishows.com/maprefresh/1553)
- [TRW upcoming productions example](https://theatricalrights.co.uk/show/big-fish/upcoming)
- [Artsdata.ca JSON-LD templates](https://docs.artsdata.ca/gabarits-jsonld/README.html)
