import { describe, expect, it } from 'vitest';
import { addDays, isIsoDate, todayIn, utcToZoned, weekday, zonedToUtc } from './local-time';

const LA = 'America/Los_Angeles';

describe('isIsoDate', () => {
  it.each([
    ['2027-03-04', true],
    ['2028-02-29', true],
    ['2027-02-29', false],
    ['2027-13-01', false],
    ['2027-3-4', false],
    ['', false],
  ])('%j → %j', (input, expected) => {
    expect(isIsoDate(input)).toBe(expected);
  });
});

describe('addDays / weekday', () => {
  it('crosses months and years', () => {
    expect(addDays('2027-02-27', 2)).toBe('2027-03-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15'); // DST day has no effect
  });
  it('numbers days from Sunday', () => {
    expect(weekday('2027-03-04')).toBe(4); // Thursday
    expect(weekday('2027-03-07')).toBe(0); // Sunday
  });
});

describe('zonedToUtc', () => {
  it('handles standard and daylight time', () => {
    expect(zonedToUtc('2027-03-04', '19:30', LA).toISOString()).toBe('2027-03-05T03:30:00.000Z');
    expect(zonedToUtc('2027-07-01', '14:00', LA).toISOString()).toBe('2027-07-01T21:00:00.000Z');
  });
  it('moves a time skipped by spring-forward one hour later', () => {
    expect(zonedToUtc('2027-03-14', '02:30', LA).toISOString()).toBe('2027-03-14T10:30:00.000Z');
  });
  it('picks the first of a repeated fall-back time', () => {
    expect(zonedToUtc('2027-11-07', '01:30', LA).toISOString()).toBe('2027-11-07T08:30:00.000Z');
  });
  it('works for other zones', () => {
    expect(zonedToUtc('2027-03-04', '19:30', 'America/New_York').toISOString()).toBe(
      '2027-03-05T00:30:00.000Z',
    );
  });
});

describe('utcToZoned', () => {
  it('round-trips', () => {
    for (const [date, time] of [
      ['2027-03-04', '19:30'],
      ['2027-07-01', '00:00'],
      ['2027-11-07', '01:30'],
      ['2027-12-31', '23:59'],
    ] as const) {
      expect(utcToZoned(zonedToUtc(date, time, LA), LA)).toEqual({ date, time });
    }
  });
  it('gives the local date for todayIn', () => {
    expect(todayIn(LA, new Date('2027-03-05T03:30:00Z'))).toBe('2027-03-04');
  });
});
