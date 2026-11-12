import { describe, expect, it } from 'vitest';
import { isValidSlug, productionSlug, slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it.each([
    ['San Diego County', 'san-diego-county'],
    ["Lamb's Players Theatre", 'lambs-players-theatre'],
    ['Cygnet Theatre — Old Town', 'cygnet-theatre-old-town'],
    ['Les Misérables', 'les-miserables'],
    ['Backyard Renaissance & Friends', 'backyard-renaissance-and-friends'],
    ['  --Hello__World--  ', 'hello-world'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('cuts long text at a word boundary', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.endsWith('word')).toBe(true);
  });
});

describe('productionSlug', () => {
  it('joins work, company and year', () => {
    expect(productionSlug('Into the Woods', 'Lamplighters Community Theatre', 2027)).toBe(
      'into-the-woods-lamplighters-community-theatre-2027',
    );
  });
});

describe('isValidSlug', () => {
  it.each([
    ['sd', true],
    ['san-diego-county', true],
    ['San-Diego', false],
    ['-sd', false],
    ['sd--county', false],
    ['', false],
  ])('%j → %s', (slug, valid) => {
    expect(isValidSlug(slug)).toBe(valid);
  });
});

describe('uniqueSlug', () => {
  it('keeps a free slug', () => {
    expect(uniqueSlug('globe', [])).toBe('globe');
  });

  it('adds the first free numeric suffix', () => {
    expect(uniqueSlug('globe', ['globe', 'globe-2'])).toBe('globe-3');
  });

  it('stays within the length limit', () => {
    const base = 'a'.repeat(80);
    expect(uniqueSlug(base, [base]).length).toBeLessThanOrEqual(80);
  });
});
