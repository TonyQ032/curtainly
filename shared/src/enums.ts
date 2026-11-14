/** Shared enum values. The Drizzle pgEnums in db/schema.ts are built from these lists. */

export const TIERS = ['professional', 'indie_fringe', 'community', 'college'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  professional: 'Professional',
  indie_fringe: 'Indie & fringe',
  community: 'Community',
  college: 'College',
};

/** Work type. Kept open ("other") so opera, dance or improv can be added later without schema changes. */
export const WORK_TYPES = ['play', 'musical', 'other'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  play: 'Play',
  musical: 'Musical',
  other: 'Other',
};

export const REGION_STATUSES = ['planned', 'building', 'live'] as const;
export type RegionStatus = (typeof REGION_STATUSES)[number];

export const PRODUCTION_STATUSES = ['draft', 'published', 'cancelled', 'archived'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

export const SOURCE_KINDS = [
  'ticketmaster',
  'ovationtix',
  'arts_people',
  'thundertix',
  'vbo',
  'jsonld',
  'custom',
  'manual',
  'submission',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Kinds that enter through the web app, never through an ingest adapter. */
export const NON_ADAPTER_SOURCE_KINDS: readonly SourceKind[] = ['manual', 'submission'];

export const SOURCE_HEALTH = ['unknown', 'healthy', 'unhealthy'] as const;
export type SourceHealth = (typeof SOURCE_HEALTH)[number];

/**
 * `not_a_show`: the source's item isn't a production (a gala, class, camp…).
 * The runner never queues that candidate key from that source again.
 */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'merged', 'not_a_show'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  merged: 'Merged',
  not_a_show: 'Not a show',
};

export const LEAD_ORIGINS = ['mti', 'trw', 'report'] as const;
export type LeadOrigin = (typeof LEAD_ORIGINS)[number];

export const LEAD_STATUSES = ['new', 'verified', 'dismissed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
