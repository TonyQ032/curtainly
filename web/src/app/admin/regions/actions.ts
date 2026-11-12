'use server';

import { slugify } from '@curtainly/shared';
import { regions } from '@curtainly/shared/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm, type FormState } from '@/lib/forms';
import { generateSlug, isSlugInUse } from '@/lib/slugs';
import { regionFormSchema, type RegionFormInput } from './schema';

const SLUG_TAKEN = { slug: ['Another region already uses this slug'] };

function toRow(input: RegionFormInput, slug: string) {
  return {
    name: input.name,
    slug,
    timezone: input.timezone,
    center: { x: input.lng, y: input.lat },
    radiusMiles: input.radiusMiles,
    status: input.status,
  };
}

function done(slug: string): never {
  revalidatePath('/admin/regions');
  redirect(`/admin/regions?saved=${encodeURIComponent(slug)}`);
}

export async function createRegion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(regionFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  let slug = input.slug;
  if (slug) {
    if (await isSlugInUse(regions, slug)) return fieldError(formData, SLUG_TAKEN);
  } else {
    // Generated from the name: take the first free one (name, name-2, …).
    slug = await generateSlug(regions, input.name, 'region');
  }

  try {
    await db().insert(regions).values(toRow(input, slug));
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}

export async function updateRegion(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(regionFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  const slug = input.slug || slugify(input.name);
  if (!slug) {
    return fieldError(formData, { slug: ['Slug is required'] });
  }
  if (await isSlugInUse(regions, slug, id)) return fieldError(formData, SLUG_TAKEN);

  try {
    const updated = await db()
      .update(regions)
      .set(toRow(input, slug))
      .where(eq(regions.id, id))
      .returning({ id: regions.id });
    if (updated.length === 0) return { status: 'error', message: 'This region no longer exists.' };
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}
