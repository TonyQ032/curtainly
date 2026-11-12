import { describe, expect, it } from 'vitest';
import {
  dedupCandidate,
  diffProduction,
  findExistingProduction,
  isEmptyDiff,
  type DedupCandidate,
  type DedupProduction,
} from './production-diff';

const TZ = 'America/Los_Angeles';
const now = new Date('2027-03-10T12:00:00Z');

/** 7:30 PM Pacific (PST until 2027-03-14) on `date`, as the adapter would send it. */
const pst = (date: string) => `${date}T19:30:00-08:00`;
const pdt = (date: string) => `${date}T19:30:00-07:00`;
const at = (iso: string) => new Date(iso);

function production(overrides: Partial<DedupProduction> = {}): DedupProduction {
  return {
    id: 'p1',
    companyId: 'c1',
    workId: 'w1',
    workNormalizedTitle: 'into the woods',
    workAltTitles: [],
    startDate: '2027-03-05',
    endDate: '2027-03-21',
    timeZone: TZ,
    priceMin: '25.00',
    priceMax: '60.00',
    ticketUrl: 'https://tix.example/woods',
    advisory: null,
    runtimeMin: 150,
    performances: [
      at(pst('2027-03-05')),
      at(pst('2027-03-06')),
      at(pst('2027-03-12')),
      at(pst('2027-03-13')),
      at(pdt('2027-03-19')),
      at(pdt('2027-03-20')),
    ],
    ...overrides,
  };
}

function candidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    title: 'Into the Woods',
    companyId: 'c1',
    performances: [
      { startsAt: pst('2027-03-12') },
      { startsAt: pst('2027-03-13') },
      { startsAt: pdt('2027-03-19') },
      { startsAt: pdt('2027-03-20') },
    ],
    priceMin: 25,
    priceMax: 60,
    ticketUrl: 'https://tix.example/woods',
    runtimeMin: 150,
    ...overrides,
  };
}

describe('findExistingProduction', () => {
  it('matches same company, same Work and overlapping dates', () => {
    expect(findExistingProduction(candidate(), [production()])?.id).toBe('p1');
  });

  it('matches title variants that normalize alike', () => {
    const c = candidate({ title: 'INTO THE WOODS: The Musical' });
    expect(findExistingProduction(c, [production()])?.id).toBe('p1');
  });

  it('matches through a Work alt title', () => {
    const p = production({ workNormalizedTitle: 'woods', workAltTitles: ['Into the Woods'] });
    expect(findExistingProduction(candidate(), [p])?.id).toBe('p1');
  });

  it('does not match another company', () => {
    expect(findExistingProduction(candidate({ companyId: 'c2' }), [production()])).toBeUndefined();
  });

  it('does not match another Work', () => {
    expect(findExistingProduction(candidate({ title: 'Company' }), [production()])).toBeUndefined();
  });

  it('does not match a run whose dates do not overlap (a revival next year)', () => {
    const c = candidate({ performances: [{ startsAt: pst('2028-02-04') }] });
    expect(findExistingProduction(c, [production()])).toBeUndefined();
  });

  it('compares dates in the production timezone, not UTC', () => {
    // 2027-03-04 9 PM Pacific is 2027-03-05 in UTC: still the day before opening.
    const c = candidate({ performances: [{ startsAt: '2027-03-04T21:00:00-08:00' }] });
    expect(findExistingProduction(c, [production()])).toBeUndefined();
    const late = candidate({ performances: [{ startsAt: '2027-03-21T23:00:00-07:00' }] });
    expect(findExistingProduction(late, [production()])?.id).toBe('p1');
  });

  it('never matches a candidate without performances', () => {
    expect(findExistingProduction(candidate({ performances: [] }), [production()])).toBeUndefined();
    const bad = candidate({ performances: [{ startsAt: 'TBA' }] });
    expect(findExistingProduction(bad, [production()])).toBeUndefined();
  });

  it('prefers the production sharing the most days', () => {
    const early = production({ id: 'early', startDate: '2027-02-01', endDate: '2027-03-12' });
    const main = production({ id: 'main' });
    expect(findExistingProduction(candidate(), [early, main])?.id).toBe('main');
  });
});

describe('diffProduction', () => {
  it('is empty when nothing upcoming changed, even though past performances dropped off', () => {
    const diff = diffProduction(production(), candidate(), now);
    expect(diff).toEqual({ performances: { added: [], removed: [] }, fields: [] });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('lists added and removed upcoming performances in UTC', () => {
    const c = candidate({
      performances: [
        { startsAt: pst('2027-03-12') },
        { startsAt: pst('2027-03-13') },
        { startsAt: '2027-03-13T14:00:00-08:00' },
        { startsAt: pdt('2027-03-20') },
      ],
    });
    expect(diffProduction(production(), c, now).performances).toEqual({
      added: ['2027-03-13T22:00:00.000Z'],
      removed: ['2027-03-20T02:30:00.000Z'],
    });
  });

  it('ignores duplicate and unparseable candidate times', () => {
    const c = candidate({
      performances: [
        ...candidate().performances,
        { startsAt: pst('2027-03-12') },
        { startsAt: '' },
      ],
    });
    expect(isEmptyDiff(diffProduction(production(), c, now))).toBe(true);
  });

  it('reports changed prices numerically and other changed facts', () => {
    const c = candidate({ priceMin: 25, priceMax: 75, ticketUrl: 'https://tix.example/new' });
    expect(diffProduction(production(), c, now).fields).toEqual([
      { field: 'priceMax', from: '60.00', to: 75 },
      { field: 'ticketUrl', from: 'https://tix.example/woods', to: 'https://tix.example/new' },
    ]);
  });

  it('proposes values for empty fields but never clears fields the candidate omits', () => {
    const c = candidate({
      priceMin: undefined,
      ticketUrl: '  ',
      advisory: ' Strobe lights ',
      runtimeMin: undefined,
    });
    expect(diffProduction(production(), c, now).fields).toEqual([
      { field: 'advisory', from: null, to: 'Strobe lights' },
    ]);
  });

  it('proposes new dates when performances run past the closing date', () => {
    const c = candidate({
      performances: [...candidate().performances, { startsAt: pdt('2027-03-27') }],
    });
    const diff = diffProduction(production(), c, now);
    expect(diff.performances.added).toEqual(['2027-03-28T02:30:00.000Z']);
    expect(diff.dates).toEqual({
      from: { startDate: '2027-03-05', endDate: '2027-03-21' },
      to: { startDate: '2027-03-05', endDate: '2027-03-27' },
    });
  });
});

describe('dedupCandidate', () => {
  it('classifies new, update and unchanged', () => {
    const productions = [production()];
    expect(dedupCandidate(candidate({ title: 'Company' }), productions, now)).toEqual({
      kind: 'new',
    });
    expect(dedupCandidate(candidate(), productions, now)).toEqual({
      kind: 'unchanged',
      productionId: 'p1',
    });
    const update = dedupCandidate(candidate({ priceMin: 20 }), productions, now);
    expect(update).toEqual({
      kind: 'update',
      productionId: 'p1',
      diff: {
        performances: { added: [], removed: [] },
        fields: [{ field: 'priceMin', from: '25.00', to: 20 }],
      },
    });
  });
});
