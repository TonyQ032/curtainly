import { describe, expect, it } from 'vitest';
import { isAdminEmail, parseAdminEmails, safeAdminPath } from './admin-emails';

describe('isAdminEmail', () => {
  const list = ' Owner@Example.com , second@example.com ,';

  it('matches case-insensitively and ignores whitespace', () => {
    expect(isAdminEmail('owner@example.com', list)).toBe(true);
    expect(isAdminEmail(' SECOND@example.com ', list)).toBe(true);
  });

  it('rejects emails not on the list', () => {
    expect(isAdminEmail('someone@example.com', list)).toBe(false);
  });

  it('fails closed when the list is empty or unset', () => {
    expect(isAdminEmail('owner@example.com', '')).toBe(false);
    expect(isAdminEmail('owner@example.com', undefined)).toBe(false);
    expect(parseAdminEmails(' , ').size).toBe(0);
  });

  it('rejects a missing email', () => {
    expect(isAdminEmail(undefined, list)).toBe(false);
    expect(isAdminEmail('', list)).toBe(false);
  });
});

describe('safeAdminPath', () => {
  it.each([
    ['/admin/companies', '/admin/companies'],
    ['/admin', '/admin'],
    [undefined, '/admin'],
    ['/', '/admin'],
    ['https://evil.example/admin', '/admin'],
    ['//evil.example/admin', '/admin'],
  ])('%s → %s', (input, expected) => {
    expect(safeAdminPath(input)).toBe(expected);
  });
});
