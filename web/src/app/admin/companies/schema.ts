import { TIERS } from '@curtainly/shared';
import { z } from 'zod';
import { idField, slugField, websiteField } from '@/lib/fields';

export { normalizeWebsite } from '@/lib/fields';

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on');

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160, 'Keep it under 160 characters'),
  slug: slugField,
  tier: z.enum(TIERS, { error: 'Pick a tier' }),
  regionId: idField('Pick a region'),
  website: websiteField,
  inScope: checkbox,
  active: checkbox,
  notes: z
    .string()
    .trim()
    .max(2000, 'Keep notes under 2000 characters')
    .transform((s) => s || null),
});

export type CompanyFormInput = z.output<typeof companyFormSchema>;
