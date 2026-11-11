/**
 * Curtainly database schema (Drizzle). Source of truth for web/ and ingest/.
 * Model: Work → Production → Performance, with Company and Venue alongside,
 * and Source + ReviewItem powering ingestion. See docs/PLAN.md → "Data model".
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  geometry,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  LEAD_ORIGINS,
  LEAD_STATUSES,
  PRODUCTION_STATUSES,
  REGION_STATUSES,
  REPORT_STATUSES,
  REVIEW_STATUSES,
  SOURCE_HEALTH,
  SOURCE_KINDS,
  TIERS,
  WORK_TYPES,
} from '../enums';

export const tierEnum = pgEnum('tier', TIERS);
export const workTypeEnum = pgEnum('work_type', WORK_TYPES);
export const regionStatusEnum = pgEnum('region_status', REGION_STATUSES);
export const productionStatusEnum = pgEnum('production_status', PRODUCTION_STATUSES);
export const sourceKindEnum = pgEnum('source_kind', SOURCE_KINDS);
export const sourceHealthEnum = pgEnum('source_health', SOURCE_HEALTH);
export const reviewStatusEnum = pgEnum('review_status', REVIEW_STATUSES);
export const leadOriginEnum = pgEnum('lead_origin', LEAD_ORIGINS);
export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES);
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES);

const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
/** WGS84 lon/lat point. Note: mode 'xy' means x = longitude, y = latitude. */
const point = (name: string) => geometry(name, { type: 'point', mode: 'xy', srid: 4326 });

export const regions = pgTable('regions', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** IANA zone, e.g. America/Los_Angeles. Drives "Tonight"/"This weekend" grouping and archiving. */
  timezone: text('timezone').notNull(),
  center: point('center').notNull(),
  radiusMiles: integer('radius_miles').notNull(),
  status: regionStatusEnum('status').notNull().default('planned'),
  ...timestamps,
});

export const companies = pgTable(
  'companies',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    tier: tierEnum('tier').notNull(),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id),
    website: text('website'),
    active: boolean('active').notNull().default(true),
    /** Inclusion is decided per producer: if true, every production it mounts is listed. */
    inScope: boolean('in_scope').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('companies_region_idx').on(t.regionId)],
);

export const venues = pgTable(
  'venues',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    address: text('address').notNull(),
    location: point('location'),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id),
    website: text('website'),
    ...timestamps,
  },
  (t) => [index('venues_location_gix').using('gist', t.location)],
);

export type WorkAuthors = {
  playwright?: string[];
  book?: string[];
  music?: string[];
  lyrics?: string[];
  other?: { role: string; names: string[] }[];
};

export const works = pgTable(
  'works',
  {
    id: id(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    normalizedTitle: text('normalized_title').notNull(),
    altTitles: text('alt_titles')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    type: workTypeEnum('type').notNull(),
    authors: jsonb('authors').$type<WorkAuthors>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('works_normalized_title_idx').on(t.normalizedTitle)],
);

export const productions = pgTable(
  'productions',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    workId: uuid('work_id')
      .notNull()
      .references(() => works.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    priceMin: numeric('price_min', { precision: 8, scale: 2 }),
    priceMax: numeric('price_max', { precision: 8, scale: 2 }),
    ticketUrl: text('ticket_url'),
    advisory: text('advisory'),
    runtimeMin: integer('runtime_min'),
    /** Original or company-submitted copy only. Never scraped description text. */
    blurb: text('blurb'),
    imageUrl: text('image_url'),
    imagePermission: boolean('image_permission').notNull().default(false),
    familyFriendly: boolean('family_friendly').notNull().default(false),
    status: productionStatusEnum('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => [
    index('productions_company_work_idx').on(t.companyId, t.workId),
    index('productions_status_end_idx').on(t.status, t.endDate),
  ],
);

export const performances = pgTable(
  'performances',
  {
    id: id(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** Overrides the production's venue for this performance. */
    venueId: uuid('venue_id').references(() => venues.id),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('performances_production_starts_uq').on(t.productionId, t.startsAt),
    index('performances_starts_at_idx').on(t.startsAt),
  ],
);

export const sources = pgTable('sources', {
  id: id(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  kind: sourceKindEnum('kind').notNull(),
  /** Adapter-specific settings (client IDs, URLs, selectors). Validated by each adapter. */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  autoApprove: boolean('auto_approve').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastItemCount: integer('last_item_count'),
  lastError: text('last_error'),
  health: sourceHealthEnum('health').notNull().default('unknown'),
  ...timestamps,
});

export const reviewItems = pgTable(
  'review_items',
  {
    id: id(),
    sourceId: uuid('source_id').references(() => sources.id),
    /** Existing production this item would update, if any. */
    productionId: uuid('production_id').references(() => productions.id),
    payload: jsonb('payload').notNull(),
    proposed: jsonb('proposed').notNull(),
    matchSuggestions: jsonb('match_suggestions')
      .$type<{ workId: string; title: string; score: number }[]>()
      .notNull()
      .default([]),
    status: reviewStatusEnum('status').notNull().default('pending'),
    rejectReason: text('reject_reason'),
    reviewer: text('reviewer'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('review_items_status_idx').on(t.status, t.createdAt)],
);

export const leads = pgTable('leads', {
  id: id(),
  companyId: uuid('company_id').references(() => companies.id),
  workTitle: text('work_title').notNull(),
  dates: text('dates'),
  origin: leadOriginEnum('origin').notNull(),
  status: leadStatusEnum('status').notNull().default('new'),
  ...timestamps,
});

export const reports = pgTable('reports', {
  id: id(),
  productionId: uuid('production_id')
    .notNull()
    .references(() => productions.id),
  message: text('message').notNull(),
  contact: text('contact'),
  status: reportStatusEnum('status').notNull().default('open'),
  ...timestamps,
});
