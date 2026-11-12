'use server';

import { slugify } from '@curtainly/shared';
import { works } from '@curtainly/shared/db/schema';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm } from '@/lib/forms';
import { generateSlug, isSlugInUse } from '@/lib/slugs';
import type { DuplicateWork, WorkFormState } from './form-state';
import { duplicateKey, titleKeys, workFormSchema, type WorkFormInput } from './schema';

const SLUG_TAKEN = { slug: ['Another work already uses this slug'] };

function toRow(input: WorkFormInput, slug: string) {
  return {
    title: input.title,
    slug,
    normalizedTitle: titleKeys(input.title, [])[0]!,
    altTitles: input.altTitles,
    type: input.type,
    authors: input.authors,
  };
}

/**
 * Other Works this one may duplicate: their normalized title equals one of ours,
 * or one of their alt titles matches one of our titles (ignoring case).
 */
async function findDuplicates(
  keys: string[],
  titles: string[],
  exceptId?: string,
): Promise<DuplicateWork[]> {
  if (keys.length === 0 && titles.length === 0) return [];
  const lowered = titles.map((t) => t.toLowerCase());
  const matches = or(
    keys.length ? inArray(works.normalizedTitle, keys) : undefined,
    lowered.length
      ? sql`exists (select 1 from unnest(${works.altTitles}) as alt where lower(alt) in ${lowered})`
      : undefined,
  );
  return db()
    .select({ id: works.id, title: works.title, type: works.type })
    .from(works)
    .where(exceptId ? and(matches, ne(works.id, exceptId)) : matches)
    .orderBy(asc(works.title))
    .limit(5);
}

/**
 * Warn once about likely duplicates. The form resubmits with `confirmDuplicate`
 * set to the key it was warned about; a different set of titles warns again.
 */
async function duplicateWarning(
  input: WorkFormInput,
  formData: FormData,
  previous?: { id: string; title: string; altTitles: string[] },
): Promise<WorkFormState | undefined> {
  const keys = titleKeys(input.title, input.altTitles);
  const key = duplicateKey(keys);
  if (input.confirmDuplicate === key) return undefined;

  // On edit, only titles that are new to this work can create a duplicate.
  const before = previous ? titleKeys(previous.title, previous.altTitles) : [];
  const beforeTitles = previous
    ? [previous.title, ...previous.altTitles].map((t) => t.toLowerCase())
    : [];
  const newKeys = keys.filter((k) => !before.includes(k));
  const newTitles = [input.title, ...input.altTitles].filter(
    (t) => !beforeTitles.includes(t.toLowerCase()),
  );
  if (newKeys.length === 0 && newTitles.length === 0) return undefined;

  const duplicates = await findDuplicates(newKeys, newTitles, previous?.id);
  if (duplicates.length === 0) return undefined;
  return {
    ...fieldError(
      formData,
      {},
      duplicates.length === 1
        ? 'A work with a matching title already exists.'
        : 'Works with matching titles already exist.',
    ),
    duplicates,
    duplicateKey: key,
  };
}

function done(slug: string): never {
  revalidatePath('/admin/works');
  redirect(`/admin/works?saved=${encodeURIComponent(slug)}`);
}

export async function createWork(_prev: WorkFormState, formData: FormData): Promise<WorkFormState> {
  await requireAdmin();
  const parsed = parseForm(workFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  let slug = input.slug;
  if (slug && (await isSlugInUse(works, slug))) return fieldError(formData, SLUG_TAKEN);

  const warning = await duplicateWarning(input, formData);
  if (warning) return warning;

  slug ||= await generateSlug(works, input.title, 'work');
  try {
    await db().insert(works).values(toRow(input, slug));
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}

export async function updateWork(
  id: string,
  _prev: WorkFormState,
  formData: FormData,
): Promise<WorkFormState> {
  await requireAdmin();
  const parsed = parseForm(workFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  const [previous] = await db()
    .select({ id: works.id, title: works.title, altTitles: works.altTitles })
    .from(works)
    .where(eq(works.id, id))
    .limit(1);
  if (!previous) return { status: 'error', message: 'This work no longer exists.' };

  const slug = input.slug || slugify(input.title);
  if (!slug) return fieldError(formData, { slug: ['Slug is required'] });
  if (await isSlugInUse(works, slug, id)) return fieldError(formData, SLUG_TAKEN);

  const warning = await duplicateWarning(input, formData, previous);
  if (warning) return warning;

  try {
    await db().update(works).set(toRow(input, slug)).where(eq(works.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug);
}
