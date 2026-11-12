/**
 * One ingest run: load sources, run each through its adapter, record health.
 * The database sits behind `SourceStore` so this can be tested without one.
 */
import type { SourceHealth, SourceKind } from '@curtainly/shared';
import { isUnhealthy, runSource } from './runner';
import type { Adapter, AdapterContext, SourceRef, SourceRunResult } from './types';

/** Kinds that enter through the web app, never through an adapter. */
export const NON_ADAPTER_KINDS: readonly SourceKind[] = ['manual', 'submission'];

/** A Source row as the runner sees it: the adapter's view plus the health fields. */
export interface StoredSource extends SourceRef {
  enabled: boolean;
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
  health?: SourceHealth;
  error?: string;
  ms: number;
}

export interface RunSummary {
  outcomes: SourceOutcome[];
  ok: number;
  failed: number;
  unhealthy: number;
  items: number;
  candidates: number;
}

export interface RunAllOptions {
  store: SourceStore;
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
    const update = healthUpdate(source, result, now());
    const outcome: SourceOutcome = {
      sourceId: source.id,
      kind: source.kind,
      ok: result.ok,
      itemCount: result.itemCount,
      candidateCount: result.candidates.length,
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
        ? `${prefix} ok: ${result.itemCount} item(s), ${result.candidates.length} candidate(s), ${update.health}`
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
  };
}

/** Plain-text summary for the Actions log. */
export function formatSummary(summary: RunSummary, ms: number): string {
  const lines = [
    `[ingest] ${summary.outcomes.length} source(s) in ${(ms / 1000).toFixed(1)}s: ` +
      `${summary.ok} ok, ${summary.failed} failed, ${summary.unhealthy} unhealthy; ` +
      `${summary.items} item(s), ${summary.candidates} candidate(s)`,
  ];
  for (const o of summary.outcomes.filter((o) => !o.ok)) {
    lines.push(`  FAILED ${o.kind} ${o.sourceId}: ${o.error}`);
  }
  for (const o of summary.outcomes.filter((o) => o.ok && o.health === 'unhealthy')) {
    lines.push(`  UNHEALTHY ${o.kind} ${o.sourceId}: no items for 3+ days`);
  }
  return lines.join('\n');
}
