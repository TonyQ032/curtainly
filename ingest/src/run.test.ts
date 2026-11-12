import { describe, expect, it } from 'vitest';
import {
  formatSummary,
  healthUpdate,
  runAll,
  type SourceHealthUpdate,
  type SourceStore,
  type StoredSource,
} from './run';
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
