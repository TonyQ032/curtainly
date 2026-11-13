import { buildWorkIndex, type DedupProduction } from '@curtainly/shared';
import { describe, expect, it } from 'vitest';
import { candidateKey, mergeCandidates, planReviewItems } from './review-queue';
import type { CandidateProduction } from './types';

const now = new Date('2027-01-10T12:00:00Z');
const works = buildWorkIndex([
  { id: 'w1', title: 'Into the Woods', normalizedTitle: 'into the woods', altTitles: [] },
  { id: 'w2', title: 'Assassins', normalizedTitle: 'assassins', altTitles: [] },
]);

function candidate(
  title: string,
  starts: string[],
  extra: Partial<CandidateProduction> = {},
): CandidateProduction {
  return {
    title,
    companyId: 'c1',
    performances: starts.map((startsAt) => ({ startsAt })),
    raw: { data: { title, starts } },
    ...extra,
  };
}

const woods: DedupProduction = {
  id: 'p1',
  companyId: 'c1',
  workId: 'w1',
  workNormalizedTitle: 'into the woods',
  workAltTitles: [],
  startDate: '2027-01-15',
  endDate: '2027-01-24',
  timeZone: 'America/Los_Angeles',
  priceMin: '25.00',
  priceMax: null,
  ticketUrl: null,
  advisory: null,
  runtimeMin: null,
  performances: [
    new Date('2027-01-16T03:30:00Z'), // Fri Jan 15, 7:30pm
    new Date('2027-01-23T03:30:00Z'), // Fri Jan 22, 7:30pm
  ],
};
const FRI_15 = '2027-01-15T19:30:00-08:00';
const FRI_22 = '2027-01-22T19:30:00-08:00';
const SAT_23 = '2027-01-23T19:30:00-08:00';

describe('candidateKey', () => {
  it('prefers the upstream id, then the normalized title', () => {
    expect(candidateKey(candidate('X', [], { raw: { externalId: ' 42 ', data: null } }))).toBe(
      'external:42',
    );
    expect(candidateKey(candidate('The Into the Woods!', []))).toBe('title:into the woods');
    expect(candidateKey(candidate('  ', []))).toBeUndefined();
  });
});

describe('mergeCandidates', () => {
  it('unions performances and takes the first value for other fields', () => {
    const { candidate: merged, payload } = mergeCandidates([
      candidate('Into the Woods', [FRI_22]),
      candidate('Into the Woods', [FRI_15, FRI_22], { priceMin: 30, ticketUrl: 'https://a' }),
      candidate('Into the Woods', [], { priceMin: 40 }),
    ]);
    expect(merged.performances.map((p) => p.startsAt)).toEqual([FRI_15, FRI_22]);
    expect(merged.priceMin).toBe(30);
    expect(merged.ticketUrl).toBe('https://a');
    expect(payload).toHaveLength(3);
  });
});

describe('planReviewItems', () => {
  it('proposes a new production with Work suggestions', () => {
    const plan = planReviewItems([candidate('Assassins', [FRI_15])], [woods], works, now);
    expect(plan.unchanged).toEqual([]);
    expect(plan.entries).toHaveLength(1);
    const [entry] = plan.entries;
    expect(entry).toMatchObject({
      key: 'title:assassins',
      kind: 'new',
      productionId: null,
      diff: null,
      proposed: { title: 'Assassins', companyId: 'c1', performances: [{ startsAt: FRI_15 }] },
    });
    expect(entry?.proposed).not.toHaveProperty('raw');
    expect(entry?.proposed).not.toHaveProperty('priceMin');
    expect(entry?.matchSuggestions[0]).toMatchObject({ workId: 'w2', score: 1 });
  });

  it('proposes an update with its diff and no suggestions', () => {
    const plan = planReviewItems(
      [candidate('Into the Woods', [FRI_15, FRI_22, SAT_23])],
      [woods],
      works,
      now,
    );
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      key: 'title:into the woods',
      kind: 'update',
      productionId: 'p1',
      matchSuggestions: [],
      diff: { performances: { added: ['2027-01-24T03:30:00.000Z'], removed: [] } },
    });
  });

  it('reports unchanged candidates so stale items can be cleared', () => {
    const plan = planReviewItems(
      [candidate('Into the Woods', [FRI_15, FRI_22])],
      [woods],
      works,
      now,
    );
    expect(plan.entries).toEqual([]);
    expect(plan.unchanged).toEqual([{ key: 'title:into the woods', productionId: 'p1' }]);
  });

  it('merges per-week listings of one production instead of proposing removals', () => {
    // Each week listed as its own event: alone, each would remove the other week.
    const plan = planReviewItems(
      [
        candidate('Into the Woods', [FRI_15], { raw: { externalId: 'wk1', data: 1 } }),
        candidate('Into the Woods', [FRI_22], { raw: { externalId: 'wk2', data: 2 } }),
      ],
      [woods],
      works,
      now,
    );
    expect(plan.entries).toEqual([]);
    expect(plan.unchanged).toEqual([{ key: 'external:wk1', productionId: 'p1' }]);
  });

  it('merges new candidates that share a key into one entry', () => {
    const plan = planReviewItems(
      [candidate('Assassins', [FRI_15]), candidate('Assassins', [FRI_22], { priceMax: 50 })],
      [],
      works,
      now,
    );
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]?.proposed.performances).toHaveLength(2);
    expect(plan.entries[0]?.proposed.priceMax).toBe(50);
    expect(plan.entries[0]?.payload).toHaveLength(2);
  });

  it('folds a new candidate into a matched one with the same key', () => {
    // Same title, but the March dates don't overlap the January run on their own.
    const plan = planReviewItems(
      [
        candidate('Into the Woods', [FRI_15, FRI_22]),
        candidate('Into the Woods', ['2027-03-05T19:30:00-08:00']),
      ],
      [woods],
      works,
      now,
    );
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({ kind: 'update', productionId: 'p1' });
    expect(plan.entries[0]?.diff?.dates?.to.endDate).toBe('2027-03-05');
  });

  it('skips candidates without a title or id', () => {
    const plan = planReviewItems([candidate('', [FRI_15])], [], works, now);
    expect(plan).toEqual({ entries: [], unchanged: [], skipped: 1 });
  });

  it('gives the same plan on a rerun', () => {
    const input = [candidate('Into the Woods', [FRI_15, SAT_23]), candidate('Assassins', [FRI_15])];
    expect(planReviewItems(input, [woods], works, now)).toEqual(
      planReviewItems(input, [woods], works, now),
    );
  });
});
