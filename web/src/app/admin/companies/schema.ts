import { TIERS, isValidSlug } from '@curtainly/shared';
import { z } from 'zod';

/** "oldglobe.org" → "https://oldglobe.org"; blank → null. */
export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160, 'Keep it under 160 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (s) => s === '' || isValidSlug(s),
      'Lowercase letters, numbers and single hyphens only',
    ),
  tier: z.enum(TIERS, { error: 'Pick a tier' }),
  regionId: z.string().regex(UUID, 'Pick a region'),
  website: z
    .string()
    .transform(normalizeWebsite)
    .refine((url) => {
      if (url === null) return true;
      try {
        const u = new URL(url);
        return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
      } catch {
        return false;
      }
    }, 'Enter a website like oldglobe.org'),
  inScope: checkbox,
  active: checkbox,
  notes: z
    .string()
    .trim()
    .max(2000, 'Keep notes under 2000 characters')
    .transform((s) => s || null),
});

export type CompanyFormInput = z.output<typeof companyFormSchema>;
