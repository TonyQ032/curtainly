'use server';

import { slugify, uniqueSlug } from '@curtainly/shared';
import { regions } from '@curtainly/shared/db/schema';
import { and, eq, like, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseForm, type FormState } from '@/lib/forms';
import { regionFormSchema, type RegionFormInput } from './schema';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function slugTaken(state: FormState | undefined, formData: FormData): FormState {
  return {
    status: 'error',
    message: 'Please fix the highlighted fields.',
    fieldErrors: { slug: ['Another region already uses this slug'] },
    values: state?.values ?? Object.fromEntries([...formData].map(([k, v]) => [k, String(v)])),
  };
}

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

/** Is `slug` used by a region other than `exceptId`? */
async function isSlugInUse(slug: string, exceptId?: string) {
  const rows = await db()
    .select({ id: regions.id })
    .from(regions)
    .where(
      exceptId ? and(eq(regions.slug, slug), ne(regions.id, exceptId)) : eq(regions.slug, slug),
    )
    .limit(1);
  return rows.length > 0;
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
    if (await isSlugInUse(slug)) return slugTaken(undefined, formData);
  } else {
    // Generated from the name: take the first free one (name, name-2, …).
    const base = slugify(input.name) || 'region';
    const taken = await db()
      .select({ slug: regions.slug })
      .from(regions)
      .where(like(regions.slug, `${base}%`));
    slug = uniqueSlug(
      base,
      taken.map((r) => r.slug),
    );
  }

  try {
    await db().insert(regions).values(toRow(input, slug));
  } catch (err) {
    if (isUniqueViolation(err)) return slugTaken(undefined, formData);
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
    return {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { slug: ['Slug is required'] },
    };
  }
  if (await isSlugInUse(slug, id)) return slugTaken(undefined, formData);

  try {
    const updated = await db()
      .update(regions)
      .set(toRow(input, slug))
      .where(eq(regions.id, id))
      .returning({ id: regions.id });
    if (updated.length === 0) return { status: 'error', message: 'This region no longer exists.' };
  } catch (err) {
    if (isUniqueViolation(err)) return slugTaken(undefined, formData);
    throw err;
  }
  done(slug);
}
