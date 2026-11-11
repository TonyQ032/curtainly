import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  it.each([
    ['Into the Woods', 'into the woods'],
    ['INTO THE WOODS', 'into the woods'],
    ['Into the Woods Jr.', 'into the woods'],
    ['Into The Woods: Youth Edition', 'into the woods'],
    ['The Music Man', 'music man'],
    ['Little Shop of Horrors - The Musical', 'little shop of horrors'],
    ["Annie Get Your Gun (Broadway's)", 'annie get your gun broadways'],
    ['Les Misérables', 'les miserables'],
    ['Joseph & the Amazing Technicolor Dreamcoat', 'joseph and the amazing technicolor dreamcoat'],
    ['Frozen JR. The Musical', 'frozen'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it('does not reduce a title to an empty string', () => {
    expect(normalizeTitle('The Musical')).toBe('musical');
  });
});
