import 'server-only';
import { slugify, uniqueSlug } from '@curtainly/shared';
import { and, eq, like, ne, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from './db';

type SluggedTable = PgTable & { id: AnyPgColumn; slug: AnyPgColumn };

/** Is `slug` used by a row other than `exceptId`? */
export async function isSlugInUse(table: SluggedTable, slug: string, exceptId?: string) {
  const where: SQL | undefined = exceptId
    ? and(eq(table.slug, slug), ne(table.id, exceptId))
    : eq(table.slug, slug);
  const rows = await db().select({ id: table.id }).from(table).where(where).limit(1);
  return rows.length > 0;
}

/** First free slug generated from `name` (name, name-2, …). */
export async function generateSlug(table: SluggedTable, name: string, fallback: string) {
  const base = slugify(name) || fallback;
  const taken = await db()
    .select({ slug: table.slug })
    .from(table)
    .where(like(table.slug, `${base}%`));
  return uniqueSlug(
    base,
    taken.map((r) => String(r.slug)),
  );
}
