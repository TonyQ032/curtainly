import { describe, expect, it } from 'vitest';
import {
  archiveEnded,
  formatArchiveSummary,
  hasEnded,
  type ArchiveRegion,
  type ArchiveStore,
  type ArchivedProduction,
} from './archive';

const LA = 'America/Los_Angeles';

describe('hasEnded', () => {
  it('keeps a run through its last local day, archives from local midnight', () => {
    // 2026-11-29 (Sun) is PST, UTC−8: local midnight is 08:00Z on the 30th.
    expect(hasEnded('2026-11-29', LA, new Date('2026-11-30T07:59:59Z'))).toBe(false);
    expect(hasEnded('2026-11-29', LA, new Date('2026-11-30T08:00:00Z'))).toBe(true);
  });

  it('uses the local date, not the UTC date', () => {
    // 23:30 local on the 29th is already the 30th in UTC.
    const lateSunday = new Date('2026-11-30T07:30:00Z');
    expect(new Date(lateSunday).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(hasEnded('2026-11-29', LA, lateSunday)).toBe(false);
  });

  it('at the daily cron time (11:00 UTC) archives runs that ended yesterday local', () => {
    const cron = new Date('2026-11-30T11:00:00Z'); // 03:00 PST on the 30th
    expect(hasEnded('2026-11-29', LA, cron)).toBe(true);
    expect(hasEnded('2026-11-30', LA, cron)).toBe(false);
  });

  it('handles midnight in daylight time (UTC−7)', () => {
    expect(hasEnded('2027-07-04', LA, new Date('2027-07-05T06:59:59Z'))).toBe(false);
    expect(hasEnded('2027-07-04', LA, new Date('2027-07-05T07:00:00Z'))).toBe(true);
  });

  it('handles the days clocks change', () => {
    // Spring forward 2027-03-14: midnight on the 15th is PDT (07:00Z).
    expect(hasEnded('2027-03-14', LA, new Date('2027-03-15T06:59:59Z'))).toBe(false);
    expect(hasEnded('2027-03-14', LA, new Date('2027-03-15T07:00:00Z'))).toBe(true);
    // Fall back 2027-11-07: midnight on the 8th is PST (08:00Z); the day is 25 hours.
    expect(hasEnded('2027-11-07', LA, new Date('2027-11-08T07:59:59Z'))).toBe(false);
    expect(hasEnded('2027-11-07', LA, new Date('2027-11-08T08:00:00Z'))).toBe(true);
  });

  it('works ahead of UTC too', () => {
    // Tokyo is UTC+9: its 30th starts at 15:00Z on the 29th.
    expect(hasEnded('2026-11-29', 'Asia/Tokyo', new Date('2026-11-29T14:59:59Z'))).toBe(false);
    expect(hasEnded('2026-11-29', 'Asia/Tokyo', new Date('2026-11-29T15:00:00Z'))).toBe(true);
  });

  it('handles year boundaries', () => {
    expect(hasEnded('2026-12-31', LA, new Date('2027-01-01T07:59:00Z'))).toBe(false);
    expect(hasEnded('2026-12-31', LA, new Date('2027-01-01T08:00:00Z'))).toBe(true);
  });
});

interface Row extends ArchivedProduction {
  regionId: string;
  status: 'draft' | 'published' | 'cancelled' | 'archived';
}

function memoryStore(regions: ArchiveRegion[], rows: Row[], failRegions: string[] = []) {
  const calls: { regionId: string; today: string }[] = [];
  const store: ArchiveStore = {
    async loadRegions() {
      return regions;
    },
    async archiveEndedBefore(regionId, today) {
      calls.push({ regionId, today });
      if (failRegions.includes(regionId)) throw new Error('db down');
      const hit = rows.filter(
        (r) => r.regionId === regionId && r.status === 'published' && r.endDate < today,
      );
      for (const r of hit) r.status = 'archived';
      return hit.map(({ id, slug, endDate }) => ({ id, slug, endDate }));
    },
  };
  return { store, calls, rows };
}

const sd: ArchiveRegion = { id: 'r-sd', slug: 'san-diego', timezone: LA };
const nyc: ArchiveRegion = { id: 'r-ny', slug: 'new-york', timezone: 'America/New_York' };

function row(id: string, regionId: string, endDate: string, status: Row['status'] = 'published') {
  return { id, slug: id, regionId, endDate, status };
}

describe('archiveEnded', () => {
  it("passes each Region its own local date and archives only that Region's ended runs", async () => {
    // 05:30Z on 11-30: already the 30th in New York (00:30), still the 29th in San Diego (21:30).
    const now = new Date('2026-11-30T05:30:00Z');
    const { store, calls, rows } = memoryStore(
      [sd, nyc],
      [row('sd-ends-29', 'r-sd', '2026-11-29'), row('ny-ends-29', 'r-ny', '2026-11-29')],
    );
    const summary = await archiveEnded({ store, now: () => now, log: () => {} });

    expect(calls).toEqual([
      { regionId: 'r-sd', today: '2026-11-29' },
      { regionId: 'r-ny', today: '2026-11-30' },
    ]);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['sd-ends-29', 'published'],
      ['ny-ends-29', 'archived'],
    ]);
    expect(summary.archived).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it('leaves drafts, cancelled and future runs alone', async () => {
    const now = new Date('2026-11-30T11:00:00Z');
    const { store, rows } = memoryStore(
      [sd],
      [
        row('ended', 'r-sd', '2026-11-29'),
        row('ends-today', 'r-sd', '2026-11-30'),
        row('draft', 'r-sd', '2026-11-01', 'draft'),
        row('cancelled', 'r-sd', '2026-11-01', 'cancelled'),
      ],
    );
    const summary = await archiveEnded({ store, now: () => now, log: () => {} });
    expect(rows.filter((r) => r.status === 'archived').map((r) => r.id)).toEqual(['ended']);
    expect(summary.regions[0]?.archived.map((p) => p.id)).toEqual(['ended']);
  });

  it('is idempotent', async () => {
    const now = new Date('2026-11-30T11:00:00Z');
    const { store } = memoryStore([sd], [row('ended', 'r-sd', '2026-11-29')]);
    expect((await archiveEnded({ store, now: () => now, log: () => {} })).archived).toBe(1);
    expect((await archiveEnded({ store, now: () => now, log: () => {} })).archived).toBe(0);
  });

  it('keeps going when one Region fails or has a bad timezone', async () => {
    const now = new Date('2026-11-30T11:00:00Z');
    const bad: ArchiveRegion = { id: 'r-bad', slug: 'bad', timezone: 'Not/AZone' };
    const { store } = memoryStore(
      [bad, nyc, sd],
      [row('ny', 'r-ny', '2026-11-01'), row('sd', 'r-sd', '2026-11-01')],
      ['r-ny'],
    );
    const logs: string[] = [];
    const summary = await archiveEnded({ store, now: () => now, log: (m) => logs.push(m) });

    expect(summary.failed).toBe(2);
    expect(summary.archived).toBe(1);
    expect(summary.regions.map((r) => [r.slug, r.error !== undefined])).toEqual([
      ['bad', true],
      ['new-york', true],
      ['san-diego', false],
    ]);
    expect(logs.some((m) => m.includes('invalid timezone "Not/AZone"'))).toBe(true);
    expect(formatArchiveSummary(summary)).toBe(
      '[archive] 1 production(s) archived — bad: failed, new-york: failed, san-diego: 1 (before 2026-11-30)',
    );
  });
});
