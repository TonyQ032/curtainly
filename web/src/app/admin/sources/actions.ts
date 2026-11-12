'use server';

import { companies, sources } from '@curtainly/shared/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError } from '@/lib/form-errors';
import { parseForm, type FormState } from '@/lib/forms';
import { sourceFormSchema, type SourceFormInput } from './schema';

function toRow(input: SourceFormInput) {
  return {
    companyId: input.companyId,
    kind: input.kind,
    config: input.config,
    enabled: input.enabled,
    autoApprove: input.autoApprove,
  };
}

async function companyExists(id: string) {
  const rows = await db()
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  return rows.length > 0;
}

function done(): never {
  revalidatePath('/admin/sources');
  redirect('/admin/sources?saved=1');
}

export async function createSource(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(sourceFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!(await companyExists(parsed.data.companyId)))
    return fieldError(formData, { companyId: ['Pick a company'] });

  await db().insert(sources).values(toRow(parsed.data));
  done();
}

export async function updateSource(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(sourceFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!(await companyExists(parsed.data.companyId)))
    return fieldError(formData, { companyId: ['Pick a company'] });

  // Health fields (last run, error, counts) are written by the runner only.
  const updated = await db()
    .update(sources)
    .set(toRow(parsed.data))
    .where(eq(sources.id, id))
    .returning({ id: sources.id });
  if (updated.length === 0) return { status: 'error', message: 'This source no longer exists.' };
  done();
}
