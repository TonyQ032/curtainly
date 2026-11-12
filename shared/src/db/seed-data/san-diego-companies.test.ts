import { describe, expect, it } from 'vitest';
import { TIERS } from '../../enums';
import { isValidSlug, slugify } from '../../slug';
import { SAN_DIEGO_COMPANIES, TICKETING_PLATFORMS, seedNotes } from './san-diego-companies';

describe('San Diego company seed', () => {
  it('has unique, valid slugs', () => {
    const slugs = SAN_DIEGO_COMPANIES.map((c) => slugify(c.name));
    for (const s of slugs) expect(isValidSlug(s), s).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses known tiers and ticketing platforms', () => {
    for (const c of SAN_DIEGO_COMPANIES) {
      expect(TIERS, c.name).toContain(c.tier);
      expect(TICKETING_PLATFORMS, c.name).toContain(c.ticketing.platform);
    }
  });

  it('stores websites as absolute http(s) URLs', () => {
    for (const c of SAN_DIEGO_COMPANIES) {
      if (c.website === null) continue;
      expect(new URL(c.website).protocol, c.name).toBe('https:');
    }
  });

  it('records a reason for every excluded or inactive company', () => {
    for (const c of SAN_DIEGO_COMPANIES) {
      if (!c.inScope) expect(c.notes, c.name).toMatch(/^Excluded: /);
      if (c.inScope && !c.active) expect(c.notes, c.name).toBeTruthy();
    }
  });

  it('keeps notes within the admin form limit', () => {
    for (const c of SAN_DIEGO_COMPANIES) expect(seedNotes(c).length, c.name).toBeLessThan(2000);
  });

  it('writes ticketing, venues and city into notes', () => {
    const cygnet = SAN_DIEGO_COMPANIES.find((c) => c.name === 'Cygnet Theatre')!;
    expect(seedNotes(cygnet)).toBe(
      'Ticketing: Spektrix (https://purchase.cygnettheatre.org).\nVenues: Old Town Theatre.\nCity: San Diego.',
    );
  });
});
