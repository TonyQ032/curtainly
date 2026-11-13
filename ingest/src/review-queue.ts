/**
 * Turn one source's candidates into review-queue entries (#23). Pure: the
 * runner passes the company's productions and the Work index, and a
 * `ReviewQueueStore` writes the result.
 *
 * - Each candidate is deduped (#22): new, update (with a diff) or unchanged.
 * - Candidates that refer to the same production, or share a candidate key,
 *   are merged first. Platforms often list one event per performance or
 *   per week, and diffing each piece alone would propose removing the others.
 * - Every entry has a key (`external:<id>` or `title:<normalized title>`) that
 *   stays stable across runs, so the store keeps one pending item per key.
 */
import {
  dedupCandidate,
  normalizeTitle,
  suggestWorks,
  type DedupProduction,
  type MatchableWork,
  type ProductionDiff,
  type WorkIndex,
  type WorkMatch,
} from '@curtainly/shared';
import type { CandidateProduction, RawItem } from './types';

/** What the reviewer is asked to publish: the candidate without its raw item. */
export type ProposedProduction = Omit<CandidateProduction, 'raw'>;

export interface QueueEntry {
  key: string;
  kind: 'new' | 'update';
  /** The production an update applies to; null for new productions. */
  productionId: string | null;
  /** Raw items the entry was built from (several when candidates were merged). */
  payload: RawItem[];
  proposed: ProposedProduction;
  diff: ProductionDiff | null;
  /** Work suggestions for new productions; empty for updates (the Work is known). */
  matchSuggestions: WorkMatch[];
}

export interface ReviewPlan {
  entries: QueueEntry[];
  /** Candidates matching a production with nothing to change. Any pending item for them is stale. */
  unchanged: { key: string; productionId: string }[];
  /** Candidates with no usable title or id, dropped. */
  skipped: number;
}

/** Stable identity of a candidate within its source, or undefined when it has neither id nor title. */
export function candidateKey(candidate: CandidateProduction): string | undefined {
  const external = candidate.raw.externalId?.trim();
  if (external) return `external:${external}`;
  const title = normalizeTitle(candidate.title);
  return title ? `title:${title}` : undefined;
}

const first = <T>(values: (T | undefined)[]) => values.find((v) => v !== undefined);

/** One candidate from several: performances combined, other fields from the first that has them. */
export function mergeCandidates(group: readonly CandidateProduction[]): {
  candidate: CandidateProduction;
  payload: RawItem[];
} {
  const [head] = group;
  if (!head) throw new Error('mergeCandidates needs at least one candidate');
  const payload = group.map((c) => c.raw);
  if (group.length === 1) return { candidate: head, payload };

  const byInstant = new Map<number, string>();
  for (const c of group) {
    for (const p of c.performances) {
      const t = new Date(p.startsAt).getTime();
      if (!Number.isNaN(t) && !byInstant.has(t)) byInstant.set(t, p.startsAt);
    }
  }
  const performances = [...byInstant.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, startsAt]) => ({ startsAt }));

  return {
    candidate: {
      title: head.title,
      companyId: head.companyId,
      venueName: first(group.map((c) => c.venueName)),
      venueAddress: first(group.map((c) => c.venueAddress)),
      performances,
      priceMin: first(group.map((c) => c.priceMin)),
      priceMax: first(group.map((c) => c.priceMax)),
      ticketUrl: first(group.map((c) => c.ticketUrl)),
      advisory: first(group.map((c) => c.advisory)),
      runtimeMin: first(group.map((c) => c.runtimeMin)),
      raw: head.raw,
    },
    payload,
  };
}

function proposedOf(candidate: CandidateProduction): ProposedProduction {
  // Drop the raw item and undefined fields so the stored JSON (and change detection) is stable.
  return Object.fromEntries(
    Object.entries(candidate).filter(([k, v]) => k !== 'raw' && v !== undefined),
  ) as ProposedProduction;
}

interface Group {
  key: string;
  candidates: CandidateProduction[];
}

export function planReviewItems(
  candidates: readonly CandidateProduction[],
  productions: readonly DedupProduction[],
  works: WorkIndex,
  now: Date,
): ReviewPlan {
  let skipped = 0;
  const byProduction = new Map<string, Group>();
  const byKey = new Map<string, Group>();
  const pendingNew: { key: string; candidate: CandidateProduction }[] = [];

  // Matched candidates group by production; their keys are claimed by that group.
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!key) {
      skipped++;
      continue;
    }
    const result = dedupCandidate(candidate, productions, now);
    if (result.kind === 'new') {
      pendingNew.push({ key, candidate });
      continue;
    }
    const group = byProduction.get(result.productionId) ??
      byKey.get(key) ?? { key, candidates: [] };
    group.candidates.push(candidate);
    if (!byProduction.has(result.productionId)) byProduction.set(result.productionId, group);
    if (!byKey.has(key)) byKey.set(key, group);
  }
  // New candidates join a group with their key, so one key never yields two entries.
  for (const { key, candidate } of pendingNew) {
    let group = byKey.get(key);
    if (!group) {
      group = { key, candidates: [] };
      byKey.set(key, group);
    }
    group.candidates.push(candidate);
  }

  const groups = new Set([...byProduction.values(), ...byKey.values()]);
  const plan: ReviewPlan = { entries: [], unchanged: [], skipped };
  for (const group of groups) {
    const { candidate, payload } = mergeCandidates(group.candidates);
    const result = dedupCandidate(candidate, productions, now);
    if (result.kind === 'unchanged') {
      plan.unchanged.push({ key: group.key, productionId: result.productionId });
      continue;
    }
    plan.entries.push({
      key: group.key,
      kind: result.kind,
      productionId: result.kind === 'update' ? result.productionId : null,
      payload,
      proposed: proposedOf(candidate),
      diff: result.kind === 'update' ? result.diff : null,
      matchSuggestions: result.kind === 'new' ? suggestWorks(candidate.title, works) : [],
    });
  }
  return plan;
}

export interface QueueCounts {
  /** New pending items. */
  created: number;
  /** Pending items whose content changed since the last run. */
  updated: number;
  /** Updates published directly from an auto-approve source (logged as approved items). */
  autoApproved: number;
  /** Stale pending items removed because their production no longer needs a change. */
  cleared: number;
}

export interface ReviewQueueStore {
  /** Every Work, for match suggestions. Called once per run. */
  loadWorks(): Promise<MatchableWork[]>;
  /**
   * Write a source's plan: upsert one pending item per entry key, publish
   * updates directly when `autoApprove`, and clear stale pending items.
   */
  write(
    source: { id: string; autoApprove: boolean },
    plan: ReviewPlan,
    now: Date,
  ): Promise<QueueCounts>;
}
