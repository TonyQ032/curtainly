import { describe, expect, it } from 'vitest';
import { isUnhealthy, runSource } from './runner';
import type { Adapter, AdapterContext, SourceRef } from './types';

const source: SourceRef = { id: 's1', companyId: 'c1', kind: 'jsonld', config: {} };
const ctx: AdapterContext = { fetch, log: () => {} };

describe('runSource', () => {
  it('normalizes every raw item', async () => {
    const adapter: Adapter = {
      kind: 'jsonld',
      fetch: async () => [{ data: 'a' }, { data: 'b' }],
      normalize: (raw) => [{ title: String(raw.data), companyId: 'c1', performances: [], raw }],
    };
    const result = await runSource(source, adapter, ctx);
    expect(result.ok).toBe(true);
    expect(result.itemCount).toBe(2);
    expect(result.candidates.map((c) => c.title)).toEqual(['a', 'b']);
  });

  it('returns an error instead of throwing', async () => {
    const adapter: Adapter = {
      kind: 'jsonld',
      fetch: async () => {
        throw new Error('boom');
      },
      normalize: () => [],
    };
    const result = await runSource(source, adapter, ctx);
    expect(result).toMatchObject({ ok: false, error: 'boom' });
  });

  it('fails when no adapter is registered', async () => {
    const result = await runSource(source, undefined, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('isUnhealthy', () => {
  const now = new Date('2027-01-10T12:00:00Z');
  it('flags failed runs', () => {
    expect(isUnhealthy({ ok: false, itemCount: 0, lastSuccessWithItemsAt: null, now })).toBe(true);
  });
  it('flags 3+ days of zero items for a source that normally has items', () => {
    const last = new Date('2027-01-07T12:00:00Z');
    expect(isUnhealthy({ ok: true, itemCount: 0, lastSuccessWithItemsAt: last, now })).toBe(true);
  });
  it('tolerates a short gap', () => {
    const last = new Date('2027-01-09T12:00:00Z');
    expect(isUnhealthy({ ok: true, itemCount: 0, lastSuccessWithItemsAt: last, now })).toBe(false);
  });
});
