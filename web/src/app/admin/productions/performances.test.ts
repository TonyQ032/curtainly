import { describe, expect, it } from 'vitest';
import { generateSchedule, mergeRows, scheduleProblem } from './performances';

describe('generateSchedule', () => {
  it('builds Thu–Sat evenings plus weekend matinees between two dates', () => {
    const rows = generateSchedule({
      from: '2027-03-04', // Thursday
      to: '2027-03-14', // Sunday
      slots: [
        { days: [4, 5, 6], time: '19:30' },
        { days: [6, 0], time: '14:00' },
      ],
    });
    expect(rows).toEqual([
      { date: '2027-03-04', time: '19:30' },
      { date: '2027-03-05', time: '19:30' },
      { date: '2027-03-06', time: '14:00' },
      { date: '2027-03-06', time: '19:30' },
      { date: '2027-03-07', time: '14:00' },
      { date: '2027-03-11', time: '19:30' },
      { date: '2027-03-12', time: '19:30' },
      { date: '2027-03-13', time: '14:00' },
      { date: '2027-03-13', time: '19:30' },
      { date: '2027-03-14', time: '14:00' },
    ]);
  });

  it('drops repeats when two slots share a day and time', () => {
    const rows = generateSchedule({
      from: '2027-03-06',
      to: '2027-03-06',
      slots: [
        { days: [6], time: '19:30' },
        { days: [5, 6], time: '19:30' },
      ],
    });
    expect(rows).toEqual([{ date: '2027-03-06', time: '19:30' }]);
  });

  it('ignores slots with no days or no time', () => {
    expect(
      generateSchedule({
        from: '2027-03-04',
        to: '2027-03-05',
        slots: [
          { days: [], time: '19:30' },
          { days: [4], time: '' },
          { days: [5], time: '20:00' },
        ],
      }),
    ).toEqual([{ date: '2027-03-05', time: '20:00' }]);
  });
});

describe('scheduleProblem', () => {
  const slots = [{ days: [4], time: '19:30' }];
  it.each([
    [{ from: '', to: '2027-03-05', slots }, 'Pick the first and last dates.'],
    [{ from: '2027-03-05', to: '2027-03-04', slots }, 'The last date is before the first.'],
    [{ from: '2027-01-01', to: '2030-01-01', slots }, 'Keep the schedule under two years.'],
    [{ from: '2027-03-04', to: '2027-03-05', slots: [] }, 'Pick at least one day and a time.'],
    [{ from: '2027-03-04', to: '2027-03-05', slots }, undefined],
  ])('%#', (schedule, expected) => {
    expect(scheduleProblem(schedule)).toBe(expected);
  });
});

describe('mergeRows', () => {
  it('adds new slots, skips listed ones and sorts', () => {
    const existing = [
      { date: '2027-03-06', time: '19:30', venueId: '', notes: 'Opening night' },
      { date: '2027-03-04', time: '19:30', venueId: '', notes: '' },
    ];
    const result = mergeRows(existing, [
      { date: '2027-03-05', time: '19:30' },
      { date: '2027-03-06', time: '19:30' },
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.rows.map((r) => `${r.date} ${r.time} ${r.notes}`)).toEqual([
      '2027-03-04 19:30 ',
      '2027-03-05 19:30 ',
      '2027-03-06 19:30 Opening night',
    ]);
  });
});
