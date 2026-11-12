'use server';

import { slugify } from '@curtainly/shared';
import { companies, regions } from '@curtainly/shared/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm, type FormState } from '@/lib/forms';
import { generateSlug, isSlugInUse } from '@/lib/slugs';
import { companyFormSchema, type CompanyFormInput } from './schema';

const SLUG_TAKEN = { slug: ['Another company already uses this slug'] };

function toRow(input: CompanyFormInput, slug: string) {
  return {
    name: input.name,
    slug,
    tier: input.tier,
    regionId: input.regionId,
    website: input.website,
    inScope: input.inScope,
    active: input.active,
    notes: input.notes,
  };
}

async function regionExists(id: string) {
  const rows = await db()
    .select({ id: regions.id })
    .from(regions)
    .where(eq(regions.id, id))
    .limit(1);
  return rows.length > 0;
}

function done(slug: string): never {
  revalidatePath('/admin/companies');
  redirect(`/admin/companies?saved=${encodeURIComponent(slug)}`);
}

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(companyFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;
  if (!(await regionExists(input.regionId)))
    return fieldError(formData, { regionId: ['Pick a region'] });

  let slug = input.slug;
  if (slug) {
    if (await isSlugInUse(companies, slug)) return fieldError(formData, SLUG_TAKEN);
  } else {
    slug = await generateSlug(companies, input.name, 'company');
  }

  try {
    await db().insert(companies).values(toRow(input, slug));
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}

export async function updateCompany(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(companyFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;
  if (!(await regionExists(input.regionId)))
    return fieldError(formData, { regionId: ['Pick a region'] });

  const slug = input.slug || slugify(input.name);
  if (!slug) return fieldError(formData, { slug: ['Slug is required'] });
  if (await isSlugInUse(companies, slug, id)) return fieldError(formData, SLUG_TAKEN);

  try {
    const updated = await db()
      .update(companies)
      .set(toRow(input, slug))
      .where(eq(companies.id, id))
      .returning({ id: companies.id });
    if (updated.length === 0) return { status: 'error', message: 'This company no longer exists.' };
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}
