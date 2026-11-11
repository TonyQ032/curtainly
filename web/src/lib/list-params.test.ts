import { describe, expect, it } from 'vitest';
import { likePattern, listHref, pageCount, parseListParams } from './list-params';

describe('parseListParams', () => {
  it('defaults to page 1 with no search', () => {
    expect(parseListParams({})).toEqual({ q: '', page: 1, pageSize: 25, offset: 0 });
  });

  it('reads q and page', () => {
    expect(parseListParams({ q: '  globe ', page: '3' }, 10)).toEqual({
      q: 'globe',
      page: 3,
      pageSize: 10,
      offset: 20,
    });
  });

  it.each(['0', '-2', 'abc', ''])('falls back to page 1 for %j', (page) => {
    expect(parseListParams({ page }).page).toBe(1);
  });

  it('uses the first value of repeated params', () => {
    expect(parseListParams({ q: ['a', 'b'] }).q).toBe('a');
  });
});

describe('pageCount', () => {
  it('is at least 1', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});

describe('listHref', () => {
  it('keeps current params and applies changes', () => {
    expect(listHref('/admin/regions', { q: 'sd', page: '2' }, { page: 3 })).toBe(
      '/admin/regions?q=sd&page=3',
    );
  });

  it('drops page 1 and empty values', () => {
    expect(listHref('/admin/regions', { q: 'sd', page: '2' }, { page: 1, q: '' })).toBe(
      '/admin/regions',
    );
  });
});

describe('likePattern', () => {
  it('escapes wildcards', () => {
    expect(likePattern('100%_off')).toBe('%100\\%\\_off%');
  });
});
