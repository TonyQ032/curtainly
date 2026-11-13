import { describe, expect, it } from 'vitest';
import {
  additiveDiff,
  applyDiffToRows,
  isKnownTitle,
  localDateRange,
  matchVenue,
  parseProposed,
  preselectedWork,
  priceText,
  proposedInstants,
} from './review-item';

const LA = 'America/Los_Angeles';

describe('parseProposed', () => {
  it('reads a stored candidate and rejects other shapes', () => {
    expect(
      parseProposed({ title: 'Assassins', companyId: 'c1', performances: [], priceMin: 20 }),
    ).toMatchObject({ title: 'Assassins', priceMin: 20 });
    expect(parseProposed({ title: 'Assassins', companyId: 'c1' })?.performances).toEqual([]);
    expect(parseProposed({ message: 'wrong date' })).toBeNull();
    expect(parseProposed(null)).toBeNull();
  });
});

describe('proposedInstants and localDateRange', () => {
  it('sorts, dedupes and drops invalid times; dates are local', () => {
    const instants = proposedInstants({
      performances: [
        { startsAt: '2027-03-05T19:30:00-08:00' },
        { startsAt: 'not a date' },
        { startsAt: '2027-03-04T19:30:00-08:00' },
        { startsAt: '2027-03-05T03:30:00Z' }, // same instant as Mar 4, 7:30pm local
      ],
    });
    expect(instants.map((d) => d.toISOString())).toEqual([
      '2027-03-05T03:30:00.000Z',
      '2027-03-06T03:30:00.000Z',
    ]);
    expect(localDateRange(instants, LA)).toEqual({
      startDate: '2027-03-04',
      endDate: '2027-03-05',
    });
    expect(localDateRange([], LA)).toBeNull();
  });
});

describe('preselectedWork', () => {
  const match = (kind: 'exact' | 'similar' | 'alt_title') => ({
    workId: 'w1',
    title: 'Assassins',
    score: 1,
    kind,
    matchedTitle: 'Assassins',
  });
  it('only preselects title or alt title matches', () => {
    expect(preselectedWork([match('exact')])?.workId).toBe('w1');
    expect(preselectedWork([match('alt_title')])?.workId).toBe('w1');
    expect(preselectedWork([match('similar')])).toBeUndefined();
    expect(preselectedWork([])).toBeUndefined();
  });
});

describe('matchVenue', () => {
  const venues = [
    { id: 'v1', name: 'Old Globe Theatre', regionId: 'sd' },
    { id: 'v2', name: 'Lyceum Theatre', regionId: 'sd' },
    { id: 'v3', name: 'Lyceum Theatre', regionId: 'la' },
  ];
  it('prefers an equal name in the company’s region', () => {
    expect(matchVenue('The Lyceum Theatre', venues, { regionId: 'la' })).toBe('v3');
    expect(matchVenue('Lyceum Theatre', venues, { regionId: 'sd' })).toBe('v2');
  });
  it('falls back to containment, then the usual venue', () => {
    expect(matchVenue('Old Globe', venues)).toBe('v1');
    expect(matchVenue('Somewhere Else', venues, { usualVenueId: 'v2' })).toBe('v2');
    expect(matchVenue(undefined, venues, { usualVenueId: 'gone' })).toBeUndefined();
  });
});

describe('isKnownTitle', () => {
  const work = {
    normalizedTitle: 'beauty and the beast',
    altTitles: ['Disney’s Beauty and the Beast'],
  };
  it('matches the title or an alt title after normalizing', () => {
    expect(isKnownTitle('Beauty and the Beast', work)).toBe(true);
    expect(isKnownTitle("Disney's Beauty and the Beast!", work)).toBe(true);
    expect(isKnownTitle('The Beast Within', work)).toBe(false);
  });
});

describe('diff helpers', () => {
  const diff = {
    performances: {
      added: ['2027-03-07T03:30:00.000Z'], // Mar 6, 7:30pm
      removed: ['2027-03-05T03:30:00.000Z'], // Mar 4, 7:30pm
    },
    fields: [],
  };

  it('additiveDiff never removes performances', () => {
    expect(additiveDiff(diff).performances).toEqual({
      added: diff.performances.added,
      removed: [],
    });
  });

  it('applyDiffToRows removes and adds local rows, keeping overrides on the rest', () => {
    const rows = [
      { date: '2027-03-04', time: '19:30', venueId: '', notes: '' },
      { date: '2027-03-05', time: '19:30', venueId: 'v9', notes: 'ASL' },
    ];
    expect(applyDiffToRows(rows, diff, LA)).toEqual([
      { date: '2027-03-05', time: '19:30', venueId: 'v9', notes: 'ASL' },
      { date: '2027-03-06', time: '19:30', venueId: '', notes: '' },
    ]);
  });
});

describe('priceText', () => {
  it('formats prices for inputs', () => {
    expect(priceText(25)).toBe('25');
    expect(priceText('42.50')).toBe('42.50');
    expect(priceText(undefined)).toBe('');
    expect(priceText(null)).toBe('');
  });
});
