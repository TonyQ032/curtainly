import { describe, expect, it } from 'vitest';
import { distanceMiles, osmMapUrl } from './geo';

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    expect(distanceMiles({ lat: 32.7, lng: -117.1 }, { lat: 32.7, lng: -117.1 })).toBe(0);
  });

  it('matches a known distance (San Diego → Los Angeles ≈ 112 mi)', () => {
    const d = distanceMiles({ lat: 32.7157, lng: -117.1611 }, { lat: 34.0522, lng: -118.2437 });
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(116);
  });
});

describe('osmMapUrl', () => {
  it('builds a marker link', () => {
    expect(osmMapUrl(32.7, -117.1)).toBe(
      'https://www.openstreetmap.org/?mlat=32.7&mlon=-117.1#map=17/32.7/-117.1',
    );
  });
});
