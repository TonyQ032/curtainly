import { describe, expect, it } from 'vitest';
import { creditLines } from './credits';

describe('creditLines', () => {
  it('returns nothing for empty credits', () => {
    expect(creditLines({})).toEqual([]);
    expect(creditLines(null)).toEqual([]);
  });

  it('lists roles in order and merges shared names', () => {
    expect(
      creditLines({
        lyrics: ['Stephen Sondheim'],
        music: ['Stephen Sondheim'],
        book: ['James Lapine'],
      }),
    ).toEqual(['Book: James Lapine', 'Music & lyrics: Stephen Sondheim']);
  });

  it('merges three roles with commas and includes other credits', () => {
    expect(
      creditLines({
        book: ['Lin-Manuel Miranda'],
        music: ['Lin-Manuel Miranda'],
        lyrics: ['Lin-Manuel Miranda'],
        other: [{ role: 'Based on the book by', names: ['Ron Chernow'] }],
      }),
    ).toEqual(['Book, music & lyrics: Lin-Manuel Miranda', 'Based on the book by: Ron Chernow']);
  });
});
