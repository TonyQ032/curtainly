import { z } from 'zod';
import { idField, slugField, websiteField } from '@/lib/fields';

/** Optional decimal degrees: blank → null. */
const coordinate = (label: string, limit: number) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === '') return null;
      const n = Number(s);
      if (!Number.isFinite(n) || Math.abs(n) > limit) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a number from -${limit} to ${limit}`,
        });
        return z.NEVER;
      }
      return n;
    });

export const venueFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(160, 'Keep it under 160 characters'),
    slug: slugField,
    address: z
      .string()
      .trim()
      .min(5, 'Enter the street address, city and state')
      .max(300, 'Keep it under 300 characters'),
    regionId: idField('Pick a region'),
    website: websiteField,
    lat: coordinate('Latitude', 90),
    lng: coordinate('Longitude', 180),
  })
  .superRefine((v, ctx) => {
    if ((v.lat === null) !== (v.lng === null)) {
      const missing = v.lat === null ? 'lat' : 'lng';
      ctx.addIssue({
        code: 'custom',
        path: [missing],
        message: 'Enter both latitude and longitude, or neither',
      });
    }
  });

export type VenueFormInput = z.output<typeof venueFormSchema>;

type Point = { lat: number; lng: number };

export type LocationPlan =
  { kind: 'manual'; lat: number; lng: number } | { kind: 'geocode' } | { kind: 'keep' };

/**
 * Decide where a venue's coordinates come from on save.
 * - New venue: typed coordinates win; otherwise look the address up.
 * - Edit: blank coordinates mean "look it up again"; changed coordinates are
 *   used as typed; unchanged coordinates are kept unless the address changed,
 *   in which case they're stale and the new address is looked up.
 */
export function planLocation(
  input: { address: string; lat: number | null; lng: number | null },
  previous?: { address: string; location: Point | null },
): LocationPlan {
  const typed =
    input.lat !== null && input.lng !== null ? { lat: input.lat, lng: input.lng } : null;
  if (!previous) return typed ? { kind: 'manual', ...typed } : { kind: 'geocode' };
  if (!typed) return { kind: 'geocode' };

  const prev = previous.location;
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-7;
  const coordsUnchanged = prev !== null && same(prev.lat, typed.lat) && same(prev.lng, typed.lng);
  if (!coordsUnchanged) return { kind: 'manual', ...typed };

  const addressChanged =
    previous.address.trim().replace(/\s+/g, ' ').toLowerCase() !==
    input.address.trim().replace(/\s+/g, ' ').toLowerCase();
  return addressChanged ? { kind: 'geocode' } : { kind: 'keep' };
}
