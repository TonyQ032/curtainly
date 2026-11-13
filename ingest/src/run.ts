/**
 * One ingest run: load sources, run each through its adapter, dedup the
 * candidates, write them to the review queue and record health. The database
 * sits behind store interfaces so this can be tested without one.
 */
import {
  buildWorkIndex,
  type DedupProduction,
  type SourceHealth,
  type SourceKind,
  type WorkIndex,
} from '@curtainly/shared';
import {
  planReviewItems,
  type QueueCounts,
  type ReviewPlan,
  type ReviewQueueStore,
} from './review-queue';
import { isUnhealthy, runSource } from './runner';
import type { Adapter, AdapterContext, SourceRef, SourceRunResult } from './types';

/** Kinds that enter through the web app, never through an adapter. */
export const NON_ADAPTER_KINDS: readonly SourceKind[] = ['manual', 'submission'];

/** A Source row as the runner sees it: the adapter's view plus the health fields. */
export interface StoredSource extends SourceRef {
  enabled: boolean;
  /** Updates publish directly (still logged as approved ReviewItems). */
  autoApprove: boolean;
  lastItemsAt: Date | null;
}

export interface SourceHealthUpdate {
  lastRunAt: Date;
  lastSuccessAt?: Date;
  lastItemCount: number;
  lastItemsAt?: Date;
  lastError: string | null;
  health: SourceHealth;
}

/** Existing productions to dedup candidates against. */
export interface ProductionStore {
  /** The company's productions that could still overlap a listed run. */
  loadForCompany(companyId: string): Promise<DedupProduction[]>;
}

export interface SourceStore {
  /** Enabled adapter-backed sources, or the one source with `id` (enabled or not). */
  loadSources(id?: string): Promise<StoredSource[]>;
  recordRun(id: string, update: SourceHealthUpdate): Promise<void>;
}

/** Health fields to write after a run. Fields left undefined keep their stored value. */
export function healthUpdate(
  source: Pick<StoredSource, 'lastItemsAt'>,
  result: Pick<SourceRunResult, 'ok' | 'itemCount' | 'error'>,
  now: Date,
): SourceHealthUpdate {
  const hasItems = result.ok && result.itemCount > 0;
  const unhealthy = isUnhealthy({
    ok: result.ok,
    itemCount: result.itemCount,
    lastSuccessWithItemsAt: source.lastItemsAt,
    now,
  });
  return {
    lastRunAt: now,
    lastSuccessAt: result.ok ? now : undefined,
    lastItemCount: result.itemCount,
    lastItemsAt: hasItems ? now : undefined,
    lastError: result.ok ? null : (result.error ?? 'Unknown error'),
    health: unhealthy ? 'unhealthy' : 'healthy',
  };
}

export interface SourceOutcome {
  sourceId: string;
  kind: SourceKind;
  ok: boolean;
  itemCount: number;
  candidateCount: number;
  /** Dedup counts, present when a ProductionStore was given and loading succeeded. */
  dedup?: DedupCounts;
  /** Review-queue writes, present when a ReviewQueueStore was given and writing succeeded. */
  queue?: QueueCounts;
  health?: SourceHealth;
  error?: string;
  ms: number;
}

/** Counted after merging candidates that refer to the same production. */
export interface DedupCounts {
  new: number;
  updates: number;
  /** Matched an existing production with nothing to change: no ReviewItem. */
  unchanged: number;
}

export function countDedup(plan: ReviewPlan): DedupCounts {
  return {
    new: plan.entries.filter((e) => e.kind === 'new').length,
    updates: plan.entries.filter((e) => e.kind === 'update').length,
    unchanged: plan.unchanged.length,
  };
}

export interface RunSummary {
  outcomes: SourceOutcome[];
  ok: number;
  failed: number;
  unhealthy: number;
  items: number;
  candidates: number;
  /** Totals over sources that were deduped. */
  dedup: DedupCounts;
  /** Totals over sources whose review items were written. */
  queue: QueueCounts;
}

export interface RunAllOptions {
  store: SourceStore;
  /** When given, candidates are deduped against existing productions. */
  productions?: ProductionStore;
  /** When given (with `productions`), new and update candidates are written to the review queue. */
  reviewQueue?: ReviewQueueStore;
  adapters: Partial<Record<SourceKind, Adapter>>;
  /** Shared by all sources in the run (one polite fetch per run). */
  fetch: typeof fetch;
  /** Run only this source id. */
  sourceId?: string;
  /** Sources run at once. Per-host politeness is enforced by the fetch. Default 4. */
  concurrency?: number;
  log?: (message: string) => void;
  now?: () => Date;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Run every source. A failing source (or a failed health write) never stops the others. */
export async function runAll(options: RunAllOptions): Promise<RunSummary> {
  const log = options.log ?? console.log;
  const now = options.now ?? (() => new Date());
  const sources = await options.store.loadSources(options.sourceId);

  if (options.sourceId && sources.length === 0) {
    throw new Error(`Source ${options.sourceId} not found`);
  }

  const queue = [...sources];
  const outcomes: SourceOutcome[] = [];

  // Built on first use and shared by every source in the run.
  let workIndex: Promise<WorkIndex> | undefined;
  const loadWorkIndex = (store: ReviewQueueStore) =>
    (workIndex ??= store.loadWorks().then(buildWorkIndex));
  const emptyIndex = buildWorkIndex([]);

  async function runOne(source: StoredSource): Promise<SourceOutcome> {
    const started = Date.now();
    const prefix = `[${source.kind} ${source.id}]`;
    if (NON_ADAPTER_KINDS.includes(source.kind)) {
      log(`${prefix} skipped: ${source.kind} sources have no adapter`);
      return {
        sourceId: source.id,
        kind: source.kind,
        ok: true,
        itemCount: 0,
        candidateCount: 0,
        ms: 0,
      };
    }
    if (!source.enabled) log(`${prefix} disabled, running because it was requested by id`);

    const ctx: AdapterContext = {
      fetch: options.fetch,
      log: (message) => log(`${prefix} ${message}`),
    };
    const result = await runSource(source, options.adapters[source.kind], ctx);
    const runAt = now();
    const update = healthUpdate(source, result, runAt);

    let dedup: DedupCounts | undefined;
    let queueCounts: QueueCounts | undefined;
    if (options.productions && result.ok && result.candidates.length > 0) {
      let existing: DedupProduction[] | undefined;
      try {
        existing = await options.productions.loadForCompany(source.companyId);
      } catch (err) {
        log(`${prefix} could not load productions for dedup: ${errorMessage(err)}`);
      }
      if (existing) {
        const reviewQueue = options.reviewQueue;
        let index = emptyIndex;
        let canWrite = !!reviewQueue;
        if (reviewQueue) {
          try {
            index = await loadWorkIndex(reviewQueue);
          } catch (err) {
            canWrite = false;
            log(`${prefix} could not load works for matching: ${errorMessage(err)}`);
          }
        }
        const plan = planReviewItems(result.candidates, existing, index, runAt);
        dedup = countDedup(plan);
        if (plan.skipped > 0) log(`${prefix} skipped ${plan.skipped} candidate(s) without a title`);
        if (reviewQueue && canWrite) {
          try {
            queueCounts = await reviewQueue.write(source, plan, runAt);
          } catch (err) {
            log(`${prefix} could not write review items: ${errorMessage(err)}`);
          }
        }
      }
    }

    const outcome: SourceOutcome = {
      sourceId: source.id,
      kind: source.kind,
      ok: result.ok,
      itemCount: result.itemCount,
      candidateCount: result.candidates.length,
      dedup,
      queue: queueCounts,
      health: update.health,
      error: result.error,
      ms: Date.now() - started,
    };
    try {
      await options.store.recordRun(source.id, update);
    } catch (err) {
      log(`${prefix} could not record health: ${errorMessage(err)}`);
    }
    log(
      result.ok
        ? `${prefix} ok: ${result.itemCount} item(s), ${result.candidates.length} candidate(s)` +
            (dedup ? ` (${formatDedup(dedup)})` : '') +
            (queueCounts ? `; queue: ${formatQueue(queueCounts)}` : '') +
            `, ${update.health}`
        : `${prefix} failed: ${result.error}`,
    );
    return outcome;
  }

  async function worker() {
    for (let source = queue.shift(); source; source = queue.shift()) {
      outcomes.push(await runOne(source));
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? 4, sources.length));
  await Promise.all(Array.from({ length: workers }, worker));

  const ran = outcomes.filter((o) => o.health);
  return {
    outcomes,
    ok: ran.filter((o) => o.ok).length,
    failed: ran.filter((o) => !o.ok).length,
    unhealthy: ran.filter((o) => o.health === 'unhealthy').length,
    items: ran.reduce((sum, o) => sum + o.itemCount, 0),
    candidates: ran.reduce((sum, o) => sum + o.candidateCount, 0),
    dedup: {
      new: ran.reduce((sum, o) => sum + (o.dedup?.new ?? 0), 0),
      updates: ran.reduce((sum, o) => sum + (o.dedup?.updates ?? 0), 0),
      unchanged: ran.reduce((sum, o) => sum + (o.dedup?.unchanged ?? 0), 0),
    },
    queue: {
      created: ran.reduce((sum, o) => sum + (o.queue?.created ?? 0), 0),
      updated: ran.reduce((sum, o) => sum + (o.queue?.updated ?? 0), 0),
      autoApproved: ran.reduce((sum, o) => sum + (o.queue?.autoApproved ?? 0), 0),
      cleared: ran.reduce((sum, o) => sum + (o.queue?.cleared ?? 0), 0),
    },
  };
}

function formatDedup(d: DedupCounts) {
  return `${d.new} new, ${d.updates} update(s), ${d.unchanged} unchanged`;
}

function formatQueue(q: QueueCounts) {
  return (
    `${q.created} created, ${q.updated} updated, ${q.autoApproved} auto-approved, ` +
    `${q.cleared} cleared`
  );
}

/** Plain-text summary for the Actions log. */
export function formatSummary(summary: RunSummary, ms: number): string {
  const lines = [
    `[ingest] ${summary.outcomes.length} source(s) in ${(ms / 1000).toFixed(1)}s: ` +
      `${summary.ok} ok, ${summary.failed} failed, ${summary.unhealthy} unhealthy; ` +
      `${summary.items} item(s), ${summary.candidates} candidate(s)` +
      (summary.candidates > 0 ? ` (${formatDedup(summary.dedup)})` : ''),
  ];
  const q = summary.queue;
  if (q.created + q.updated + q.autoApproved + q.cleared > 0) {
    lines.push(`  review queue: ${formatQueue(q)}`);
  }
  for (const o of summary.outcomes.filter((o) => !o.ok)) {
    lines.push(`  FAILED ${o.kind} ${o.sourceId}: ${o.error}`);
  }
  for (const o of summary.outcomes.filter((o) => o.ok && o.health === 'unhealthy')) {
    lines.push(`  UNHEALTHY ${o.kind} ${o.sourceId}: no items for 3+ days`);
  }
  return lines.join('\n');
}
