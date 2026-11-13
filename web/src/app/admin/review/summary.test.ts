import { describe, expect, it } from 'vitest';
import type { ProductionDiff, WorkMatch } from '@curtainly/shared';
import {
  diffSummary,
  performanceSummary,
  proposedTitle,
  reviewType,
  topSuggestion,
} from './summary';

const TZ = 'America/Los_Angeles';

describe('reviewType', () => {
  it('is an update when the item links to a production', () => {
    expect(reviewType('abc')).toBe('update');
    expect(reviewType(null)).toBe('new');
  });
});

describe('proposedTitle', () => {
  it('reads the title and falls back for bad JSON', () => {
    expect(proposedTitle({ title: ' Hamlet ' })).toBe('Hamlet');
    expect(proposedTitle({ title: '' })).toBe('Untitled');
    expect(proposedTitle(null)).toBe('Untitled');
    expect(proposedTitle({ title: 3 })).toBe('Untitled');
  });
});

describe('performanceSummary', () => {
  it('counts performances and gives the local date range', () => {
    const proposed = {
      performances: [
        { startsAt: '2027-04-03T02:00:00Z' }, // Apr 2, 7 PM local
        { startsAt: '2027-03-04T19:30:00-08:00' },
        { startsAt: 'not a date' },
      ],
    };
    expect(performanceSummary(proposed, TZ)).toBe('2 · Mar 4 – Apr 2, 2027');
  });

  it('uses the venue time zone for late-evening shows', () => {
    // 03:00 UTC on Mar 5 is still Mar 4 in San Diego.
    const proposed = { performances: [{ startsAt: '2027-03-05T03:00:00Z' }] };
    expect(performanceSummary(proposed, TZ)).toBe('1 · Mar 4, 2027');
  });

  it('is null without valid performances', () => {
    expect(performanceSummary({ performances: [] }, TZ)).toBeNull();
    expect(performanceSummary({}, TZ)).toBeNull();
    expect(performanceSummary(null, TZ)).toBeNull();
  });
});

describe('diffSummary', () => {
  const empty: ProductionDiff = { performances: { added: [], removed: [] }, fields: [] };

  it('summarises performances, dates and fields once each', () => {
    const diff: ProductionDiff = {
      performances: { added: ['a', 'b'], removed: ['c'] },
      fields: [
        { field: 'priceMin', from: 20, to: 25 },
        { field: 'priceMax', from: 40, to: 45 },
        { field: 'ticketUrl', from: null, to: 'https://example.org' },
      ],
      dates: {
        from: { startDate: '2027-03-04', endDate: '2027-03-20' },
        to: { startDate: '2027-03-04', endDate: '2027-03-27' },
      },
    };
    expect(diffSummary(diff)).toBe('+2 / −1 performances, dates, price, ticket URL');
  });

  it('shows only the side that changed', () => {
    expect(diffSummary({ ...empty, performances: { added: [], removed: ['x'] } })).toBe(
      '−1 performances',
    );
  });

  it('handles missing and empty diffs', () => {
    expect(diffSummary(null)).toBe('No changes recorded');
    expect(diffSummary(empty)).toBe('No changes recorded');
  });
});

describe('topSuggestion', () => {
  it('shows the best match with its score', () => {
    const match: WorkMatch = {
      workId: 'w',
      title: 'Hamilton',
      score: 0.9,
      kind: 'main_title',
      matchedTitle: 'Hamilton',
    };
    expect(topSuggestion([match])).toBe('Hamilton (0.90)');
    expect(topSuggestion([])).toBeNull();
  });
});
