import { normalizeKeyword } from '@curtainly/shared';
import { z } from 'zod';
import { UUID_PATTERN } from '@/lib/fields';

/** Normalized keyword, at least 3 characters so a rule can't swallow a whole source. */
const keyword = z
  .string()
  .max(100, 'Keep it under 100 characters')
  .transform(normalizeKeyword)
  .refine((k) => k.length >= 3, 'Use a word or phrase of at least 3 letters');

export const filterRuleSchema = z.object({
  keyword,
  /** `global`, or the id of the source the rule belongs to. */
  scope: z
    .string()
    .refine((s) => s === 'global' || UUID_PATTERN.test(s), 'Pick where the rule applies'),
});

export type FilterRuleInput = z.output<typeof filterRuleSchema>;

/** "Not a show" in review: the keyword is optional, and must occur in the item's title. */
export const notAShowSchema = z.object({
  keyword: z
    .string()
    .optional()
    .transform((v) => v?.trim() ?? '')
    .pipe(z.union([z.literal(''), keyword]))
    .transform((k) => k || null),
});
