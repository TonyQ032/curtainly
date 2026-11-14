import { describe, expect, it } from 'vitest';
import {
  findFilterRule,
  normalizeKeyword,
  suggestKeyword,
  titleHasKeyword,
  type FilterRule,
} from './filter-rules';

describe('normalizeKeyword', () => {
  it('lowercases, strips accents and punctuation, keeps articles', () => {
    expect(normalizeKeyword('  The  Gala!  ')).toBe('the gala');
    expect(normalizeKeyword('Café Soirée')).toBe('cafe soiree');
    expect(normalizeKeyword("Kids' Camp & Class")).toBe('kids camp and class');
    expect(normalizeKeyword('Q&A')).toBe('q and a');
    expect(normalizeKeyword('—')).toBe('');
  });
});

describe('titleHasKeyword', () => {
  it('matches whole words only', () => {
    expect(titleHasKeyword('Spring Gala 2027', 'gala')).toBe(true);
    expect(titleHasKeyword('GALA: A Night of Stars', 'gala')).toBe(true);
    expect(titleHasKeyword('Galavant', 'gala')).toBe(false);
    expect(titleHasKeyword('Barefoot in the Park', 'parking')).toBe(false);
  });

  it('matches phrases as consecutive words', () => {
    expect(titleHasKeyword('Teen Acting Class (Saturdays)', 'acting class')).toBe(true);
    expect(titleHasKeyword('Acting for the Class', 'acting class')).toBe(false);
  });

  it('never matches an empty keyword', () => {
    expect(titleHasKeyword('Anything', '')).toBe(false);
  });
});

describe('findFilterRule', () => {
  const rules: FilterRule[] = [
    { id: 'g1', sourceId: null, keyword: 'gala' },
    { id: 's1', sourceId: 'src-a', keyword: 'camp' },
  ];

  it('applies global rules to every source', () => {
    expect(findFilterRule('Annual Gala', 'src-b', rules)?.id).toBe('g1');
  });

  it("applies a source's rules to that source only", () => {
    expect(findFilterRule('Summer Camp', 'src-a', rules)?.id).toBe('s1');
    expect(findFilterRule('Summer Camp', 'src-b', rules)).toBeUndefined();
  });

  it('leaves shows alone', () => {
    expect(findFilterRule('Hamilton', 'src-a', rules)).toBeUndefined();
  });
});

describe('suggestKeyword', () => {
  it('proposes a non-show word found in the title', () => {
    expect(suggestKeyword('Spring Gala & Auction')).toBe('gala');
    expect(suggestKeyword('Youth Theatre Camp: Week 2')).toBe('camp');
    expect(suggestKeyword('Open Mic Night')).toBe('open mic');
  });

  it('proposes nothing for an ordinary title', () => {
    expect(suggestKeyword('Into the Woods')).toBe('');
  });
});
