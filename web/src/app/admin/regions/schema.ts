import { REGION_STATUSES, isValidSlug } from '@curtainly/shared';
import { z } from 'zod';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const number = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .pipe(z.coerce.number({ error: `${label} must be a number` }))
    .pipe(
      z
        .number()
        .min(min, `${label} must be ${min} to ${max}`)
        .max(max, `${label} must be ${min} to ${max}`),
    );

/** Region form input. Slug may be blank on create (generated from the name). */
export const regionFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Keep it under 120 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (s) => s === '' || isValidSlug(s),
      'Lowercase letters, numbers and single hyphens only',
    ),
  timezone: z.string().refine(isValidTimeZone, 'Pick a timezone from the list'),
  lat: number('Latitude', -90, 90),
  lng: number('Longitude', -180, 180),
  radiusMiles: number('Radius', 1, 500).pipe(
    z.number().int('Radius must be a whole number of miles'),
  ),
  status: z.enum(REGION_STATUSES, { error: 'Pick a status' }),
});

export type RegionFormInput = z.output<typeof regionFormSchema>;
