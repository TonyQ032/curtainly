'use server';

import { NON_ADAPTER_SOURCE_KINDS } from '@curtainly/shared';
import { filterRules, sources } from '@curtainly/shared/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError } from '@/lib/form-errors';
import { isUuid } from '@/lib/fields';
import { parseForm, type FormState } from '@/lib/forms';
import { addFilterRule, closeMatchingPending } from './rule-data';
import { filterRuleSchema } from './schema';

export async function createFilterRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(filterRuleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { keyword, scope } = parsed.data;
  const sourceId = scope === 'global' ? null : scope;

  if (sourceId) {
    const [source] = await db()
      .select({ kind: sources.kind })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);
    if (!source || NON_ADAPTER_SOURCE_KINDS.includes(source.kind)) {
      return fieldError(formData, { scope: ['Pick a source that runs an adapter'] });
    }
  }

  let closed = 0;
  const result = await db().transaction(async (tx) => {
    const added = await addFilterRule(tx, { sourceId, keyword, createdBy: email });
    if (added === 'added') closed = await closeMatchingPending(tx, { sourceId, keyword }, email);
    return added;
  });
  if (result !== 'added') {
    return fieldError(formData, {
      keyword: [
        result === 'global' || !sourceId
          ? `“${keyword}” is already a rule for every source`
          : `“${keyword}” is already a rule for this source`,
      ],
    });
  }

  revalidatePath('/admin', 'layout');
  redirect(`/admin/filter-rules?added=${encodeURIComponent(keyword)}&closed=${closed}`);
}

export async function deleteFilterRule(id: string): Promise<void> {
  await requireAdmin();
  if (isUuid(id)) await db().delete(filterRules).where(eq(filterRules.id, id));
  revalidatePath('/admin/filter-rules');
}
