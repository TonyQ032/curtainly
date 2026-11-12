import { describe, expect, it } from 'vitest';
import { productionFormSchema } from './schema';

const WORK = '11111111-1111-4111-8111-111111111111';
const COMPANY = '22222222-2222-4222-8222-222222222222';
const VENUE = '33333333-3333-4333-8333-333333333333';
const OTHER_VENUE = '44444444-4444-4444-8444-444444444444';

const perf = (date: string, time: string, extra: object = {}) => ({
  date,
  time,
  venueId: '',
  notes: '',
  ...extra,
});

const valid = {
  workId: WORK,
  newWorkTitle: '',
  confirmNewWork: '',
  companyId: COMPANY,
  venueId: VENUE,
  slug: '',
  startDate: '',
  endDate: '',
  priceMin: '$25',
  priceMax: '1,250.5',
  ticketUrl: 'tickets.example.org/show',
  advisory: '  ',
  runtimeMin: '150',
  familyFriendly: 'on',
  status: 'published',
  performances: JSON.stringify([
    perf('2027-03-06', '19:30', { notes: ' Opening night ' }),
    perf('2027-03-04', '19:30'),
    perf('', '', { notes: '' }),
    perf('2027-03-07', '14:00', { venueId: OTHER_VENUE }),
  ]),
};

function errors(input: object) {
  const result = productionFormSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('productionFormSchema', () => {
  it('parses, sorts performances and fills dates from them', () => {
    expect(productionFormSchema.parse(valid)).toEqual({
      workId: WORK,
      newWorkTitle: '',
      newWorkType: undefined,
      confirmNewWork: '',
      companyId: COMPANY,
      venueId: VENUE,
      slug: '',
      startDate: '2027-03-04',
      endDate: '2027-03-07',
      priceMin: '25.00',
      priceMax: '1250.50',
      ticketUrl: 'https://tickets.example.org/show',
      advisory: null,
      runtimeMin: 150,
      familyFriendly: true,
      status: 'published',
      performances: [
        { date: '2027-03-04', time: '19:30', venueId: null, notes: null },
        { date: '2027-03-06', time: '19:30', venueId: null, notes: 'Opening night' },
        { date: '2027-03-07', time: '14:00', venueId: OTHER_VENUE, notes: null },
      ],
    });
  });

  it('keeps typed dates around the performances', () => {
    const out = productionFormSchema.parse({
      ...valid,
      startDate: '2027-03-01',
      endDate: '2027-03-31',
    });
    expect([out.startDate, out.endDate]).toEqual(['2027-03-01', '2027-03-31']);
  });

  it('allows a draft with dates and no performances', () => {
    const out = productionFormSchema.parse({
      ...valid,
      status: 'draft',
      performances: '[]',
      startDate: '2027-03-01',
      endDate: '2027-03-31',
      familyFriendly: undefined,
    });
    expect(out.performances).toEqual([]);
    expect(out.familyFriendly).toBe(false);
  });

  it('needs dates or performances', () => {
    expect(errors({ ...valid, status: 'draft', performances: '' })).toEqual({
      startDate: 'Enter the first date, or add performances',
      endDate: 'Enter the last date, or add performances',
    });
  });

  it('needs performances to publish', () => {
    expect(
      errors({ ...valid, performances: '[]', startDate: '2027-03-01', endDate: '2027-03-02' }),
    ).toEqual({ status: 'Add at least one performance before publishing' });
  });

  it('rejects performances outside typed dates and reversed ranges', () => {
    expect(errors({ ...valid, startDate: '2027-03-05', endDate: '2027-03-06' })).toEqual({
      startDate: "There's a performance on Thu, Mar 4, 2027, before this date",
      endDate: "There's a performance on Sun, Mar 7, 2027, after this date",
    });
    expect(
      errors({
        ...valid,
        performances: '[]',
        status: 'draft',
        startDate: '2027-03-05',
        endDate: '2027-03-01',
      }),
    ).toEqual({ endDate: 'The end is before the start' });
  });

  it('reports bad performance rows', () => {
    const run = (rows: object[]) =>
      errors({ ...valid, performances: JSON.stringify(rows) }).performances;
    expect(run([perf('2027-02-30', '19:30')])).toBe('Performance 1 needs a date');
    expect(run([perf('2027-03-04', '')])).toBe('Performance 1 (Thu, Mar 4, 2027) needs a time');
    expect(run([perf('2027-03-04', '19:30'), perf('2027-03-04', '19:30')])).toBe(
      'Thu, Mar 4, 2027 at 7:30 PM is listed twice',
    );
    expect(run([perf('2027-03-04', '19:30', { venueId: 'nope' })])).toBe(
      'Performance 1 has an unknown venue',
    );
    expect(errors({ ...valid, performances: '{oops' }).performances).toBe(
      'Performances could not be read. Reload and try again.',
    );
  });

  it('checks prices and runtime', () => {
    expect(errors({ ...valid, priceMin: '50', priceMax: '20' })).toEqual({
      priceMax: 'The highest price is below the lowest',
    });
    expect(errors({ ...valid, priceMin: 'free', runtimeMin: '2.5' })).toEqual({
      priceMin: 'Enter dollars, like 25 or 42.50',
      runtimeMin: 'Minutes, from 1 to 600',
    });
  });

  it('needs a work, or a title and type for a new one', () => {
    expect(errors({ ...valid, workId: '' })).toEqual({
      workId: 'Pick a work, or create a new one',
    });
    expect(errors({ ...valid, workId: '', newWorkTitle: 'Fences' })).toEqual({
      workId: 'Pick a type for the new work',
    });
    const out = productionFormSchema.parse({
      ...valid,
      workId: '',
      newWorkTitle: ' Fences ',
      newWorkType: 'play',
    });
    expect([out.newWorkTitle, out.newWorkType]).toEqual(['Fences', 'play']);
  });
});
