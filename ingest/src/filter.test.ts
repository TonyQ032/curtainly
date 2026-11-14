import { describe, expect, it } from 'vitest';
import { describeFiltered, filterCandidates } from './filter';
import type { CandidateProduction } from './types';

const candidate = (title: string): CandidateProduction => ({
  title,
  companyId: 'c1',
  performances: [],
  raw: { data: title },
});

describe('filterCandidates', () => {
  it('splits candidates by the first matching rule', () => {
    const { kept, filtered } = filterCandidates(
      [candidate('Hamilton'), candidate('Gala Night'), candidate('Acting Class')],
      'src',
      [
        { id: '1', sourceId: null, keyword: 'gala' },
        { id: '2', sourceId: 'src', keyword: 'acting class' },
      ],
    );
    expect(kept.map((c) => c.title)).toEqual(['Hamilton']);
    expect(filtered).toEqual([
      { title: 'Gala Night', keyword: 'gala' },
      { title: 'Acting Class', keyword: 'acting class' },
    ]);
  });
});

describe('describeFiltered', () => {
  it('lists each title once and summarizes the rest', () => {
    const f = (title: string) => ({ title, keyword: 'gala' });
    expect(describeFiltered([f('A'), f('A'), f('B')])).toBe('"A" (gala), "B" (gala)');
    expect(describeFiltered([f('A'), f('B'), f('C')], 2)).toBe(
      '"A" (gala), "B" (gala), and 1 more',
    );
  });
});
