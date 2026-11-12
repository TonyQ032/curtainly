import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatTime } from './dates';

describe('formatting', () => {
  it('formats times', () => {
    expect(formatTime('19:30')).toBe('7:30 PM');
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });
  it('formats dates and ranges', () => {
    expect(formatDate('2027-03-04')).toBe('Thu, Mar 4, 2027');
    expect(formatDateRange('2027-03-04', '2027-04-02')).toBe('Mar 4 – Apr 2, 2027');
    expect(formatDateRange('2027-12-05', '2028-01-09')).toBe('Dec 5, 2027 – Jan 9, 2028');
    expect(formatDateRange('2027-03-04', '2027-03-04')).toBe('Mar 4, 2027');
  });
});
