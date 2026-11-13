import { describe, expect, it } from 'vitest';
import {
  formatSummary,
  healthUpdate,
  runAll,
  type SourceHealthUpdate,
  type SourceStore,
  type StoredSource,
} from './run';
import type { DedupProduction } from '@curtainly/shared';
import type { ReviewPlan, ReviewQueueStore } from './review-queue';
import type { Adapter } from './types';

const now = new Date('2027-01-10T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function source(id: string, overrides: Partial<StoredSource> = {}): StoredSource {
  return {
    id,
    companyId: 'c1',
    kind: 'jsonld',
    config: {},
    enabled: true,
    autoApprove: false,
    lastItemsAt: null,
    ...overrides,
  };
}

function memoryStore(rows: StoredSource[], failWrites: string[] = []) {
  const writes = new Map<string, SourceHealthUpdate>();
  const store: SourceStore = {
    async loadSources(id) {
      return id ? rows.filter((r) => r.id === id) : rows.filter((r) => r.enabled);
    },
    async recordRun(id, update) {
      if (failWrites.includes(id)) throw new Error('db down');
      writes.set(id, update);
    },
  };
  return { store, writes };
}

/** jsonld adapter whose fetch returns `items[source.id]` items, or throws for "boom". */
function fakeAdapter(items: Record<string, number>): Adapter {
  return {
    kind: 'jsonld',
    async fetch(src) {
      if (src.id === 'boom') throw new Error('upstream 500');
      return Array.from({ length: items[src.id] ?? 0 }, (_, i) => ({ data: i }));
    },
    normalize: (raw, src) => [
      { title: String(raw.data), companyId: src.companyId, performances: [], raw },
    ],
  };
}

const quiet = () => {};

describe('healthUpdate', () => {
  it('records a success with items', () => {
    const u = healthUpdate(source('a'), { ok: true, itemCount: 3 }, now);
    expect(u).toEqual({
      lastRunAt: now,
      lastSuccessAt: now,
      lastItemCount: 3,
      lastItemsAt: now,
      lastError: null,
      health: 'healthy',
    });
  });

  it('keeps lastItemsAt and stays healthy for a short zero-item gap', () => {
    const u = healthUpdate(
      source('a', { lastItemsAt: daysAgo(1) }),
      { ok: true, itemCount: 0 },
      now,
    );
    expect(u.lastItemsAt).toBeUndefined();
    expect(u.lastSuccessAt).toEqual(now);
    expect(u.health).toBe('healthy');
  });

  it('marks unhealthy after 3+ days of zero items', () => {
    const u = healthUpdate(
      source('a', { lastItemsAt: daysAgo(3) }),
      { ok: true, itemCount: 0 },
      now,
    );
    expect(u.health).toBe('unhealthy');
  });

  it('treats a source that never had items as healthy', () => {
    expect(healthUpdate(source('a'), { ok: true, itemCount: 0 }, now).health).toBe('healthy');
  });

  it('records a failure without touching the success fields', () => {
    const u = healthUpdate(source('a'), { ok: false, itemCount: 0, error: 'boom' }, now);
    expect(u).toMatchObject({ lastRunAt: now, lastError: 'boom', health: 'unhealthy' });
    expect(u.lastSuccessAt).toBeUndefined();
    expect(u.lastItemsAt).toBeUndefined();
  });
});

describe('runAll', () => {
  it('keeps going after a failing source and records health for each', async () => {
    const { store, writes } = memoryStore([source('a'), source('boom'), source('c')]);
    const summary = await runAll({
      store,
      adapters: { jsonld: fakeAdapter({ a: 2, c: 1 }) },
      fetch,
      log: quiet,
      now: () => now,
    });
    expect(summary).toMatchObject({ ok: 2, failed: 1, unhealthy: 1, items: 3, candidates: 3 });
    expect(writes.get('a')).toMatchObject({ health: 'healthy', lastItemCount: 2 });
    expect(writes.get('boom')).toMatchObject({ health: 'unhealthy', lastError: 'upstream 500' });
    expect(writes.get('c')).toMatchObject({ health: 'healthy', lastItemCount: 1 });
  });

  it('marks a source with no registered adapter as failed', async () => {
    const { store, writes } = memoryStore([source('t', { kind: 'ticketmaster' })]);
    const summary = await runAll({ store, adapters: {}, fetch, log: quiet, now: () => now });
    expect(summary.failed).toBe(1);
    expect(writes.get('t')?.lastError).toMatch(/No adapter/);
  });

  it('runs only INGEST_SOURCE_ID, even when disabled', async () => {
    const { store, writes } = memoryStore([source('a'), source('b', { enabled: false })]);
    const summary = await runAll({
      store,
      adapters: { jsonld: fakeAdapter({ b: 1 }) },
      fetch,
      sourceId: 'b',
      log: quiet,
      now: () => now,
    });
    expect(summary.outcomes.map((o) => o.sourceId)).toEqual(['b']);
    expect([...writes.keys()]).toEqual(['b']);
  });

  it('throws when the requested source does not exist', async () => {
    const { store } = memoryStore([source('a')]);
    await expect(
      runAll({ store, adapters: {}, fetch, sourceId: 'nope', log: quiet }),
    ).rejects.toThrow(/not found/);
  });

  it('skips manual and submission sources without recording health', async () => {
    const { store, writes } = memoryStore([source('m', { kind: 'manual' })]);
    const summary = await runAll({ store, adapters: {}, fetch, sourceId: 'm', log: quiet });
    expect(summary).toMatchObject({ ok: 0, failed: 0 });
    expect(writes.size).toBe(0);
  });

  it('carries on when a health write fails', async () => {
    const { store, writes } = memoryStore([source('a'), source('c')], ['a']);
    const logs: string[] = [];
    const summary = await runAll({
      store,
      adapters: { jsonld: fakeAdapter({ a: 1, c: 1 }) },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(summary.ok).toBe(2);
    expect(writes.has('c')).toBe(true);
    expect(logs.some((l) => l.includes('could not record health: db down'))).toBe(true);
  });

  const existing: DedupProduction = {
    id: 'p1',
    companyId: 'c1',
    workId: 'w1',
    workNormalizedTitle: 'into the woods',
    workAltTitles: [],
    startDate: '2027-01-15',
    endDate: '2027-01-31',
    timeZone: 'America/Los_Angeles',
    priceMin: '25.00',
    priceMax: null,
    ticketUrl: null,
    advisory: null,
    runtimeMin: null,
    performances: [new Date('2027-01-16T03:30:00Z')],
  };
  const perf = [{ startsAt: '2027-01-15T19:30:00-08:00' }];
  const company: DedupProduction = { ...existing, id: 'p2', workNormalizedTitle: 'company' };

  /** One unchanged (Into the Woods), one update (Company, new price), one new (Assassins). */
  const mixedAdapter: Adapter = {
    kind: 'jsonld',
    fetch: async () => [{ data: 0 }],
    normalize: (raw, src) => [
      { title: 'Into the Woods', companyId: src.companyId, performances: perf, raw },
      { title: 'Company', companyId: src.companyId, performances: perf, priceMin: 20, raw },
      { title: 'Assassins', companyId: src.companyId, performances: perf, raw },
    ],
  };

  function memoryQueue(opts: { failWorks?: boolean; failWrite?: boolean } = {}) {
    const writes: { source: { id: string; autoApprove: boolean }; plan: ReviewPlan }[] = [];
    let worksLoads = 0;
    const queue: ReviewQueueStore = {
      async loadWorks() {
        worksLoads++;
        if (opts.failWorks) throw new Error('works down');
        return [{ id: 'w9', title: 'Assassins', normalizedTitle: 'assassins', altTitles: [] }];
      },
      async write(source, plan) {
        if (opts.failWrite) throw new Error('queue down');
        writes.push({ source: { id: source.id, autoApprove: source.autoApprove }, plan });
        return { created: 2, updated: 0, autoApproved: 0, cleared: 1 };
      },
    };
    return { queue, writes, worksLoads: () => worksLoads };
  }

  it('dedups candidates against existing productions', async () => {
    const { store } = memoryStore([source('a')]);
    const loaded: string[] = [];
    const logs: string[] = [];
    const summary = await runAll({
      store,
      productions: {
        async loadForCompany(companyId) {
          loaded.push(companyId);
          return [existing, company];
        },
      },
      adapters: { jsonld: mixedAdapter },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(loaded).toEqual(['c1']);
    expect(summary.dedup).toEqual({ new: 1, updates: 1, unchanged: 1 });
    expect(summary.outcomes[0]?.dedup).toEqual({ new: 1, updates: 1, unchanged: 1 });
    expect(summary.outcomes[0]?.queue).toBeUndefined();
    expect(logs.some((l) => l.includes('3 candidate(s) (1 new, 1 update(s), 1 unchanged)'))).toBe(
      true,
    );
    expect(formatSummary(summary, 100)).toContain('(1 new, 1 update(s), 1 unchanged)');
  });

  it("writes each source's plan to the review queue, loading works once", async () => {
    const { store } = memoryStore([source('a'), source('b', { autoApprove: true })]);
    const { queue, writes, worksLoads } = memoryQueue();
    const logs: string[] = [];
    const summary = await runAll({
      store,
      productions: { loadForCompany: async () => [existing, company] },
      reviewQueue: queue,
      adapters: { jsonld: mixedAdapter },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(worksLoads()).toBe(1);
    expect(writes.map((w) => w.source)).toEqual(
      expect.arrayContaining([
        { id: 'a', autoApprove: false },
        { id: 'b', autoApprove: true },
      ]),
    );
    const plan = writes[0]!.plan;
    expect(plan.entries.map((e) => [e.kind, e.key, e.productionId])).toEqual([
      ['update', 'title:company', 'p2'],
      ['new', 'title:assassins', null],
    ]);
    expect(plan.entries[1]?.matchSuggestions[0]).toMatchObject({ workId: 'w9', kind: 'exact' });
    expect(plan.unchanged).toEqual([{ key: 'title:into the woods', productionId: 'p1' }]);
    expect(summary.queue).toEqual({ created: 4, updated: 0, autoApproved: 0, cleared: 2 });
    expect(logs.some((l) => l.includes('queue: 2 created, 0 updated, 0 auto-approved'))).toBe(true);
    expect(formatSummary(summary, 100)).toContain('review queue: 4 created');
  });

  it('skips queue writes when works fail to load, but still counts dedup', async () => {
    const { store, writes: health } = memoryStore([source('a')]);
    const { queue, writes } = memoryQueue({ failWorks: true });
    const logs: string[] = [];
    const summary = await runAll({
      store,
      productions: { loadForCompany: async () => [existing, company] },
      reviewQueue: queue,
      adapters: { jsonld: mixedAdapter },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(writes).toEqual([]);
    expect(summary.outcomes[0]?.dedup).toEqual({ new: 1, updates: 1, unchanged: 1 });
    expect(health.get('a')).toMatchObject({ health: 'healthy' });
    expect(logs.some((l) => l.includes('could not load works for matching: works down'))).toBe(
      true,
    );
  });

  it('records health when the queue write fails', async () => {
    const { store, writes: health } = memoryStore([source('a')]);
    const { queue } = memoryQueue({ failWrite: true });
    const logs: string[] = [];
    const summary = await runAll({
      store,
      productions: { loadForCompany: async () => [] },
      reviewQueue: queue,
      adapters: { jsonld: mixedAdapter },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(summary.outcomes[0]?.queue).toBeUndefined();
    expect(health.get('a')).toMatchObject({ health: 'healthy' });
    expect(logs.some((l) => l.includes('could not write review items: queue down'))).toBe(true);
  });

  it('still records health when productions fail to load', async () => {
    const { store, writes } = memoryStore([source('a')]);
    const logs: string[] = [];
    const summary = await runAll({
      store,
      productions: {
        async loadForCompany() {
          throw new Error('db down');
        },
      },
      adapters: { jsonld: fakeAdapter({ a: 1 }) },
      fetch,
      log: (m) => logs.push(m),
      now: () => now,
    });
    expect(summary.outcomes[0]?.dedup).toBeUndefined();
    expect(writes.get('a')).toMatchObject({ health: 'healthy' });
    expect(logs.some((l) => l.includes('could not load productions for dedup: db down'))).toBe(
      true,
    );
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const adapter: Adapter = {
      kind: 'jsonld',
      async fetch() {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return [];
      },
      normalize: () => [],
    };
    const { store } = memoryStore(['1', '2', '3', '4', '5'].map((id) => source(id)));
    await runAll({ store, adapters: { jsonld: adapter }, fetch, concurrency: 2, log: quiet });
    expect(peak).toBe(2);
  });
});

describe('formatSummary', () => {
  it('lists failed and unhealthy sources', async () => {
    const { store } = memoryStore([
      source('a'),
      source('boom'),
      source('stale', { lastItemsAt: daysAgo(5) }),
    ]);
    const summary = await runAll({
      store,
      adapters: { jsonld: fakeAdapter({ a: 1 }) },
      fetch,
      log: quiet,
      now: () => now,
    });
    const text = formatSummary(summary, 1500);
    expect(text).toContain('3 source(s) in 1.5s: 2 ok, 1 failed, 2 unhealthy; 1 item(s)');
    expect(text).toContain('FAILED jsonld boom: upstream 500');
    expect(text).toContain('UNHEALTHY jsonld stale');
  });
});
