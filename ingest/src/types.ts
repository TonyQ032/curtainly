/**
 * Adapter contract. See docs/PLAN.md → "Ingestion".
 *
 * Each Source row uses the adapter matching its `kind`. Adapters only fetch and
 * normalize; the runner owns dedup, review-queue writes and health recording.
 * Adapters must respect robots.txt, rate limits and extract facts only.
 */
import type { SourceKind } from '@curtainly/shared';

/** The subset of a Source row an adapter needs. */
export interface SourceRef {
  id: string;
  companyId: string;
  kind: SourceKind;
  config: Record<string, unknown>;
}

/** Raw item exactly as fetched, kept for the review queue's side-by-side view. */
export interface RawItem {
  /** Stable id from the upstream platform when available (used for dedup). */
  externalId?: string;
  url?: string;
  data: unknown;
}

export interface CandidatePerformance {
  /** ISO 8601 with offset, e.g. 2027-03-04T19:30:00-08:00 */
  startsAt: string;
}

export interface CandidateProduction {
  title: string;
  companyId: string;
  venueName?: string;
  venueAddress?: string;
  performances: CandidatePerformance[];
  priceMin?: number;
  priceMax?: number;
  ticketUrl?: string;
  advisory?: string;
  runtimeMin?: number;
  raw: RawItem;
}

export interface AdapterContext {
  /** Polite fetch: identifies with INGEST_USER_AGENT and is rate-limited per host. */
  fetch: typeof fetch;
  log: (message: string) => void;
}

export interface Adapter {
  kind: SourceKind;
  fetch(source: SourceRef, ctx: AdapterContext): Promise<RawItem[]>;
  normalize(raw: RawItem, source: SourceRef): CandidateProduction[];
}

export interface SourceRunResult {
  sourceId: string;
  ok: boolean;
  itemCount: number;
  candidates: CandidateProduction[];
  error?: string;
}
