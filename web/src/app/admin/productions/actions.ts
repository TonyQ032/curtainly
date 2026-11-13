'use server';

import { normalizeTitle, slugify, zonedToUtc } from '@curtainly/shared';
import {
  companies,
  performances,
  productions,
  regions,
  venues,
  works,
} from '@curtainly/shared/db/schema';
import { and, asc, eq, gte, ilike, inArray, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { formatDateRange } from '@/lib/dates';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm } from '@/lib/forms';
import { likePattern } from '@/lib/list-params';
import { generateSlug, isSlugInUse } from '@/lib/slugs';
import {
  AlreadyReviewedError,
  closeReviewItem,
  learnAltTitle,
  loadReviewItem,
  nextPendingItem,
} from '../review/review-data';
import type { ProductionFormState, WorkOption } from './form-state';
import { productionFormSchema, type ProductionFormInput } from './schema';

const SLUG_TAKEN = { slug: ['Another production already uses this slug'] };

/** Works for the picker: exact title matches first, then prefix, then anything containing `q`. */
export async function searchWorks(q: string): Promise<WorkOption[]> {
  await requireAdmin();
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const key = normalizeTitle(query);
  const pattern = likePattern(query);
  return db()
    .select({ id: works.id, title: works.title, type: works.type, altTitles: works.altTitles })
    .from(works)
    .where(
      or(
        ilike(works.title, pattern),
        key ? ilike(works.normalizedTitle, `${key}%`) : undefined,
        sql`array_to_string(${works.altTitles}, ' ') ilike ${pattern}`,
      ),
    )
    .orderBy(
      sql`case when ${works.normalizedTitle} = ${key} then 0
               when ${works.normalizedTitle} like ${`${key}%`} then 1 else 2 end`,
      asc(works.normalizedTitle),
      asc(works.title),
    )
    .limit(8);
}

/** Works a new work with this title would likely duplicate. */
async function worksMatching(title: string): Promise<WorkOption[]> {
  return db()
    .select({ id: works.id, title: works.title, type: works.type, altTitles: works.altTitles })
    .from(works)
    .where(
      or(
        eq(works.normalizedTitle, normalizeTitle(title)),
        sql`exists (select 1 from unnest(${works.altTitles}) as alt where lower(alt) = ${title.toLowerCase()})`,
      ),
    )
    .orderBy(asc(works.title))
    .limit(5);
}

type Previous = typeof productions.$inferSelect;

type Context = {
  company: { id: string; name: string; inScope: boolean };
  timezone: string;
  work: { kind: 'existing'; id: string; title: string } | { kind: 'new'; title: string };
};

/** Look up everything the save depends on; return a form error if something is missing. */
async function loadContext(
  input: ProductionFormInput,
  formData: FormData,
  previous?: Previous,
): Promise<{ ok: true; ctx: Context } | { ok: false; state: ProductionFormState }> {
  const fail = (fields: Record<string, string[]>, message?: string) => ({
    ok: false as const,
    state: fieldError(formData, fields, message),
  });

  const [[company], [venue]] = await Promise.all([
    db()
      .select({ id: companies.id, name: companies.name, inScope: companies.inScope })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1),
    db()
      .select({ id: venues.id, timezone: regions.timezone })
      .from(venues)
      .innerJoin(regions, eq(venues.regionId, regions.id))
      .where(eq(venues.id, input.venueId))
      .limit(1),
  ]);
  if (!company) return fail({ companyId: ['Pick a company'] });
  if (!venue) return fail({ venueId: ['Pick a venue'] });

  const overrideIds = [
    ...new Set(input.performances.map((p) => p.venueId).filter((v): v is string => !!v)),
  ];
  if (overrideIds.length) {
    const found = await db()
      .select({ id: venues.id })
      .from(venues)
      .where(inArray(venues.id, overrideIds));
    if (found.length !== overrideIds.length) {
      return fail({ performances: ['A performance’s venue no longer exists. Pick another.'] });
    }
  }

  if (input.status === 'published' && !company.inScope) {
    return fail({
      status: [`${company.name} is out of scope, so its productions can’t be published.`],
    });
  }
  if (input.status === 'archived' && previous?.status !== 'archived') {
    return fail({ status: ['Productions are archived automatically after they close.'] });
  }

  let work: Context['work'];
  if (input.workId) {
    const [found] = await db()
      .select({ id: works.id, title: works.title })
      .from(works)
      .where(eq(works.id, input.workId))
      .limit(1);
    if (!found) return fail({ workId: ['That work no longer exists. Pick another.'] });
    work = { kind: 'existing', ...found };
  } else {
    const key = normalizeTitle(input.newWorkTitle);
    if (input.confirmNewWork !== key) {
      const matches = await worksMatching(input.newWorkTitle);
      if (matches.length) {
        return {
          ok: false,
          state: {
            ...fieldError(
              formData,
              { workId: ['Use an existing work, or confirm this is a different one.'] },
              matches.length === 1
                ? 'A work with this title already exists.'
                : 'Works with this title already exist.',
            ),
            workMatches: matches,
            newWorkKey: key,
          },
        };
      }
    }
    work = { kind: 'new', title: input.newWorkTitle };
  }

  return { ok: true, ctx: { company, timezone: venue.timezone, work } };
}

/**
 * Same company + same Work + overlapping dates is the same production (see PLAN.md),
 * so a second one is refused with a link to the first.
 */
async function overlapError(
  input: ProductionFormInput,
  ctx: Context,
  formData: FormData,
  exceptId?: string,
): Promise<ProductionFormState | undefined> {
  if (ctx.work.kind !== 'existing') return undefined;
  const [other] = await db()
    .select({ id: productions.id, startDate: productions.startDate, endDate: productions.endDate })
    .from(productions)
    .where(
      and(
        eq(productions.companyId, ctx.company.id),
        eq(productions.workId, ctx.work.id),
        lte(productions.startDate, input.endDate),
        gte(productions.endDate, input.startDate),
        exceptId ? ne(productions.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (!other) return undefined;
  return {
    ...fieldError(
      formData,
      { endDate: ['Overlaps another production of this work by this company'] },
      `${ctx.company.name} already has a production of ${ctx.work.title} on these dates. Edit that one instead.`,
    ),
    overlapping: {
      id: other.id,
      label: `${ctx.work.title}, ${formatDateRange(other.startDate, other.endDate)}`,
    },
  };
}

function productionRow(input: ProductionFormInput) {
  return {
    companyId: input.companyId,
    venueId: input.venueId,
    startDate: input.startDate,
    endDate: input.endDate,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    ticketUrl: input.ticketUrl,
    advisory: input.advisory,
    runtimeMin: input.runtimeMin,
    familyFriendly: input.familyFriendly,
    status: input.status,
  };
}

/** Local date + time rows → performance rows, one per instant. */
function performanceValues(input: ProductionFormInput, productionId: string, timezone: string) {
  const byInstant = new Map<number, typeof performances.$inferInsert>();
  for (const p of input.performances) {
    const startsAt = zonedToUtc(p.date, p.time, timezone);
    // Two local times can land on one instant around a DST change; keep the first.
    if (byInstant.has(startsAt.getTime())) continue;
    byInstant.set(startsAt.getTime(), {
      productionId,
      startsAt,
      venueId: p.venueId === input.venueId ? null : p.venueId,
      notes: p.notes,
    });
  }
  return [...byInstant.values()];
}

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * Make the production's performances match the form: remove the ones no longer
 * listed, add new ones, and update venue and notes on the rest (matched on start time).
 */
async function syncPerformances(
  tx: Tx,
  productionId: string,
  values: (typeof performances.$inferInsert)[],
  isNew: boolean,
) {
  if (!isNew) {
    const keep = values.map((v) => v.startsAt);
    await tx
      .delete(performances)
      .where(
        and(
          eq(performances.productionId, productionId),
          keep.length ? notInArray(performances.startsAt, keep) : undefined,
        ),
      );
  }
  if (values.length === 0) return;
  await tx
    .insert(performances)
    .values(values)
    .onConflictDoUpdate({
      target: [performances.productionId, performances.startsAt],
      set: { venueId: sql`excluded.venue_id`, notes: sql`excluded.notes` },
    });
}

async function newWorkValues(ctx: Context, input: ProductionFormInput) {
  if (ctx.work.kind !== 'new') return undefined;
  return {
    title: ctx.work.title,
    slug: await generateSlug(works, ctx.work.title, 'work'),
    normalizedTitle: normalizeTitle(ctx.work.title),
    type: input.newWorkType!,
  };
}

/** e.g. "into-the-woods-lamplighters-2027" */
function slugSource(ctx: Context, input: ProductionFormInput) {
  return `${ctx.work.title} ${ctx.company.name} ${input.startDate.slice(0, 4)}`;
}

type Review = { id: string; title: string | undefined };

const REVIEW_CLOSED: ProductionFormState = {
  status: 'error',
  message: 'The review item was already reviewed, so nothing was saved. Go back to the queue.',
};

/**
 * "Edit then approve": the pending review item this save approves. A new
 * production approves a new item; an edit approves an update to that production.
 */
async function reviewToApprove(
  input: ProductionFormInput,
  productionId?: string,
): Promise<{ ok: true; review?: Review } | { ok: false; state: ProductionFormState }> {
  if (!input.reviewItemId) return { ok: true };
  const row = await loadReviewItem(input.reviewItemId);
  if (!row || row.item.status !== 'pending') return { ok: false, state: REVIEW_CLOSED };
  if ((row.item.productionId ?? undefined) !== productionId) {
    return {
      ok: false,
      state: { status: 'error', message: 'This review item is for a different production.' },
    };
  }
  return { ok: true, review: { id: row.item.id, title: row.proposed?.title } };
}

/** Inside the save's transaction: learn the source's title and close the item. */
async function approveReview(
  tx: Tx,
  review: Review | undefined,
  { reviewer, productionId, workId }: { reviewer: string; productionId: string; workId: string },
) {
  if (!review) return;
  if (review.title) await learnAltTitle(tx, workId, review.title);
  await closeReviewItem(tx, review.id, { status: 'approved', reviewer, productionId });
}

async function finish(slug: string, review: Review | undefined): Promise<never> {
  if (!review) done(slug);
  revalidatePath('/admin/review');
  revalidatePath('/admin/productions');
  revalidatePath('/admin/works');
  const nextId = await nextPendingItem(review.id);
  redirect(nextId ? `/admin/review/${nextId}` : '/admin/review');
}

function done(slug: string): never {
  revalidatePath('/admin/productions');
  revalidatePath('/admin/works');
  redirect(`/admin/productions?saved=${encodeURIComponent(slug)}`);
}

export async function createProduction(
  _prev: ProductionFormState,
  formData: FormData,
): Promise<ProductionFormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(productionFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  if (input.slug && (await isSlugInUse(productions, input.slug))) {
    return fieldError(formData, SLUG_TAKEN);
  }
  const reviewing = await reviewToApprove(input);
  if (!reviewing.ok) return reviewing.state;
  const { review } = reviewing;
  const loaded = await loadContext(input, formData);
  if (!loaded.ok) return loaded.state;
  const { ctx } = loaded;
  const overlap = await overlapError(input, ctx, formData);
  if (overlap) return overlap;

  const slug =
    input.slug || (await generateSlug(productions, slugSource(ctx, input), 'production'));
  const newWork = await newWorkValues(ctx, input);

  try {
    await db().transaction(async (tx) => {
      let workId = ctx.work.kind === 'existing' ? ctx.work.id : undefined;
      if (newWork) {
        const [created] = await tx.insert(works).values(newWork).returning({ id: works.id });
        workId = created!.id;
      }
      const [production] = await tx
        .insert(productions)
        .values({ ...productionRow(input), slug, workId: workId! })
        .returning({ id: productions.id });
      await syncPerformances(
        tx,
        production!.id,
        performanceValues(input, production!.id, ctx.timezone),
        true,
      );
      await approveReview(tx, review, {
        reviewer: email,
        productionId: production!.id,
        workId: workId!,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    if (err instanceof AlreadyReviewedError) return REVIEW_CLOSED;
    throw err;
  }
  return finish(slug, review);
}

export async function updateProduction(
  id: string,
  _prev: ProductionFormState,
  formData: FormData,
): Promise<ProductionFormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(productionFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  const [previous] = await db().select().from(productions).where(eq(productions.id, id)).limit(1);
  if (!previous) return { status: 'error', message: 'This production no longer exists.' };

  if (input.slug && (await isSlugInUse(productions, input.slug, id))) {
    return fieldError(formData, SLUG_TAKEN);
  }
  const reviewing = await reviewToApprove(input, id);
  if (!reviewing.ok) return reviewing.state;
  const { review } = reviewing;
  const loaded = await loadContext(input, formData, previous);
  if (!loaded.ok) return loaded.state;
  const { ctx } = loaded;
  const overlap = await overlapError(input, ctx, formData, id);
  if (overlap) return overlap;

  // A blank slug is regenerated, keeping the current one if it's already the generated form.
  let slug = input.slug;
  if (!slug) {
    const base = slugify(slugSource(ctx, input)) || 'production';
    slug =
      base === previous.slug || !(await isSlugInUse(productions, base, id))
        ? base
        : await generateSlug(productions, slugSource(ctx, input), 'production');
  }
  const newWork = await newWorkValues(ctx, input);

  try {
    await db().transaction(async (tx) => {
      let workId = ctx.work.kind === 'existing' ? ctx.work.id : undefined;
      if (newWork) {
        const [created] = await tx.insert(works).values(newWork).returning({ id: works.id });
        workId = created!.id;
      }
      await tx
        .update(productions)
        .set({ ...productionRow(input), slug, workId: workId! })
        .where(eq(productions.id, id));
      await syncPerformances(tx, id, performanceValues(input, id, ctx.timezone), false);
      await approveReview(tx, review, { reviewer: email, productionId: id, workId: workId! });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    if (err instanceof AlreadyReviewedError) return REVIEW_CLOSED;
    throw err;
  }
  return finish(slug, review);
}
