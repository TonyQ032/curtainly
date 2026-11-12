import { describe, expect, it } from 'vitest';
import { isValidTimeZone, regionFormSchema } from './schema';

const valid = {
  name: ' San Diego County ',
  slug: 'SD',
  timezone: 'America/Los_Angeles',
  lat: '32.95',
  lng: '-117',
  radiusMiles: '45',
  status: 'building',
};

describe('regionFormSchema', () => {
  it('parses and normalizes valid input', () => {
    expect(regionFormSchema.parse(valid)).toEqual({
      name: 'San Diego County',
      slug: 'sd',
      timezone: 'America/Los_Angeles',
      lat: 32.95,
      lng: -117,
      radiusMiles: 45,
      status: 'building',
    });
  });

  it('allows a blank slug (generated later)', () => {
    expect(regionFormSchema.parse({ ...valid, slug: '' }).slug).toBe('');
  });

  it.each([
    ['name', ''],
    ['slug', 'san diego'],
    ['timezone', 'Mars/Olympus_Mons'],
    ['lat', '91'],
    ['lng', 'west'],
    ['lat', ''],
    ['radiusMiles', '0'],
    ['radiusMiles', '12.5'],
    ['status', 'open'],
  ])('rejects %s = %j', (field, value) => {
    const result = regionFormSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Pacific Time')).toBe(false);
  });
});
