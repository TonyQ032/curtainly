import { describe, expect, it } from 'vitest';
import { fieldError, formValues, isUniqueViolation } from './form-errors';

describe('isUniqueViolation', () => {
  it('detects direct and wrapped codes', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('fieldError', () => {
  it('keeps values and skips React action fields', () => {
    const fd = new FormData();
    fd.append('$ACTION_ID_x', '');
    fd.append('slug', 'sd');
    expect(fieldError(fd, { slug: ['Taken'] })).toEqual({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { slug: ['Taken'] },
      values: { slug: 'sd' },
    });
    expect(formValues(fd)).toEqual({ slug: 'sd' });
  });
});
