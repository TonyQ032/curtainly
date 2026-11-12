import { describe, expect, it } from 'vitest';
import { planLocation, venueFormSchema } from './schema';

const valid = {
  name: 'Old Globe Theatre',
  slug: '',
  address: '1363 Old Globe Way, San Diego, CA 92101',
  regionId: '3f0e8a52-6c1d-4b8e-9a51-2f6a0c9d1e77',
  website: '',
  lat: '',
  lng: '',
};

describe('venueFormSchema', () => {
  it('parses blank coordinates as null', () => {
    const v = venueFormSchema.parse(valid);
    expect(v.lat).toBeNull();
    expect(v.lng).toBeNull();
    expect(v.website).toBeNull();
  });

  it('parses typed coordinates', () => {
    const v = venueFormSchema.parse({ ...valid, lat: ' 32.7323 ', lng: '-117.1501' });
    expect([v.lat, v.lng]).toEqual([32.7323, -117.1501]);
  });

  it.each([
    [{ lat: '32.7' }, 'lng'],
    [{ lng: '-117' }, 'lat'],
    [{ lat: '91', lng: '0' }, 'lat'],
    [{ lat: '0', lng: 'west' }, 'lng'],
    [{ address: 'SD' }, 'address'],
    [{ name: '' }, 'name'],
    [{ regionId: 'x' }, 'regionId'],
  ])('rejects %j on %s', (change, field) => {
    const result = venueFormSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe('planLocation', () => {
  const prev = {
    address: '1363 Old Globe Way, San Diego, CA',
    location: { lat: 32.7323, lng: -117.1501 },
  };

  it('new venue: geocodes unless coordinates are typed', () => {
    expect(planLocation({ address: 'a', lat: null, lng: null })).toEqual({ kind: 'geocode' });
    expect(planLocation({ address: 'a', lat: 1, lng: 2 })).toEqual({
      kind: 'manual',
      lat: 1,
      lng: 2,
    });
  });

  it('edit with blank coordinates: looks the address up again', () => {
    expect(planLocation({ address: prev.address, lat: null, lng: null }, prev)).toEqual({
      kind: 'geocode',
    });
  });

  it('edit with changed coordinates: uses them', () => {
    expect(planLocation({ address: prev.address, lat: 32.8, lng: -117.2 }, prev)).toEqual({
      kind: 'manual',
      lat: 32.8,
      lng: -117.2,
    });
  });

  it('edit with nothing location-related changed: keeps the stored point', () => {
    expect(
      planLocation(
        { address: ` ${prev.address.toUpperCase()} `, lat: 32.7323, lng: -117.1501 },
        prev,
      ),
    ).toEqual({
      kind: 'keep',
    });
  });

  it('edit with a new address but old coordinates: geocodes the new address', () => {
    expect(
      planLocation(
        { address: '2130 Pan American Plaza, San Diego, CA', lat: 32.7323, lng: -117.1501 },
        prev,
      ),
    ).toEqual({ kind: 'geocode' });
  });

  it('edit of a venue that never had a location: typed coordinates are used', () => {
    expect(
      planLocation({ address: 'a', lat: 1, lng: 2 }, { address: 'a', location: null }),
    ).toEqual({
      kind: 'manual',
      lat: 1,
      lng: 2,
    });
  });
});
