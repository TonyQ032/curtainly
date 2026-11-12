import { describe, expect, it } from 'vitest';
import { companyFormSchema, normalizeWebsite } from './schema';

const valid = {
  name: ' The Old Globe ',
  slug: '',
  tier: 'professional',
  regionId: '3f0e8a52-6c1d-4b8e-9a51-2f6a0c9d1e77',
  website: 'theoldglobe.org',
  inScope: 'on',
  notes: '  ',
};

describe('companyFormSchema', () => {
  it('parses, normalizes the website and reads checkboxes', () => {
    expect(companyFormSchema.parse(valid)).toEqual({
      name: 'The Old Globe',
      slug: '',
      tier: 'professional',
      regionId: valid.regionId,
      website: 'https://theoldglobe.org',
      inScope: true,
      active: false,
      notes: null,
    });
  });

  it('allows a blank website', () => {
    expect(companyFormSchema.parse({ ...valid, website: '' }).website).toBeNull();
  });

  it.each([
    ['name', ''],
    ['slug', 'Old Globe'],
    ['tier', 'youth'],
    ['regionId', ''],
    ['website', 'not a website'],
    ['website', 'ftp://example.org'],
  ])('rejects %s = %j', (field, value) => {
    const result = companyFormSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe('normalizeWebsite', () => {
  it.each([
    ['', null],
    ['  example.org ', 'https://example.org'],
    ['http://example.org', 'http://example.org'],
    ['HTTPS://Example.org/shows', 'HTTPS://Example.org/shows'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeWebsite(input)).toBe(expected);
  });
});
