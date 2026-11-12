import { SOURCE_KINDS } from '@curtainly/shared';
import { z } from 'zod';
import { idField } from '@/lib/fields';
import { parseSourceConfig } from './config';

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on');

export const sourceFormSchema = z
  .object({
    companyId: idField('Pick a company'),
    kind: z.enum(SOURCE_KINDS, { error: 'Pick a kind' }),
    config: z.string().max(5000, 'Keep config under 5000 characters'),
    enabled: checkbox,
    autoApprove: checkbox,
  })
  .transform((input, ctx) => {
    const parsed = parseSourceConfig(input.kind, input.config);
    if (!parsed.ok) {
      ctx.issues.push({
        code: 'custom',
        message: parsed.errors.join('. '),
        path: ['config'],
        input,
      });
      return z.NEVER;
    }
    return { ...input, config: parsed.config };
  });

export type SourceFormInput = z.output<typeof sourceFormSchema>;
