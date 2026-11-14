'use server';

import { diffProduction, normalizeTitle, titleHasKeyword } from '@curtainly/shared';
import { applyProductionDiff } from '@curtainly/shared/db/apply-diff';
import { performances, productions, venues, regions, works } from '@curtainly/shared/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { formatDateRange } from '@/lib/dates';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm, type FormState } from '@/lib/forms';
import { generateSlug } from '@/lib/slugs';
import { addFilterRule, closeMatchingPending } from '../filter-rules/rule-data';
import { notAShowSchema } from '../filter-rules/schema';
import {
  AlreadyReviewedError,
  closeReviewItem,
  learnAltTitle,
  loadDedupProduction,
  loadReviewItem,
  nextPendingItem,
  type LoadedReviewItem,
} from './review-data';
import {
  additiveDiff,
  approveNewSchema,
  localDateRange,
  mergeSchema,
  proposedInstants,
  rejectSchema,
  type Proposed,
} from './review-item';

const ALREADY_REVIEWED: FormState = {
  status: 'error',
  message: 'This item was already reviewed. Reload to see what happened.',
};

/** Load the item and check it's still pending. */
async function pendingItem(
  id: string,
): Promise<{ ok: true; item: LoadedReviewItem } | { ok: false; state: FormState }> {
  const item = await loadReviewItem(id);
  if (!item)
    return { ok: false, state: { status: 'error', message: 'This item no longer exists.' } };
  if (item.item.status !== 'pending') return { ok: false, state: ALREADY_REVIEWED };
  return { ok: true, item };
}

/** Run the writes; a concurrent review rolls them back and becomes a form error. */
async function inTransaction(
  work: (tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]) => Promise<void>,
): Promise<FormState | undefined> {
  try {
    await db().transaction(work);
  } catch (err) {
    if (err instanceof AlreadyReviewedError) return ALREADY_REVIEWED;
    throw err;
  }
  return undefined;
}

/** Back to the queue: the next pending item, or the list when it's empty. */
async function next(id: string): Promise<never> {
  // The admin layout shows the pending count in the nav.
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/productions');
  const nextId = await nextPendingItem(id);
  redirect(nextId ? `/admin/review/${nextId}` : '/admin/review');
}

const money = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) && n >= 0 && n <= 99_999 ? n.toFixed(2) : null;

const runtime = (n: number | undefined) =>
  n !== undefined && Number.isInteger(n) && n >= 1 && n <= 600 ? n : null;

function ticketUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Approve an update (apply its diff) or a new item (create the production, and its Work if new). */
export async function approveReviewItem(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const loaded = await pendingItem(id);
  if (!loaded.ok) return loaded.state;
  const { item } = loaded;

  if (item.item.productionId) {
    const { productionId, diff } = item.item;
    if (!diff) return { status: 'error', message: 'This update has no changes to apply.' };
    const failed = await inTransaction(async (tx) => {
      await applyProductionDiff(tx, productionId, diff);
      await closeReviewItem(tx, id, { status: 'approved', reviewer: email, productionId });
    });
    if (failed) return failed;
    return next(id);
  }

  const { proposed, company } = item;
  if (!proposed || !company) {
    return {
      status: 'error',
      message: 'This item has no usable production or company. Use Edit then approve.',
    };
  }
  return approveNew(id, proposed, company, email, formData);
}

async function approveNew(
  id: string,
  proposed: Proposed,
  company: NonNullable<LoadedReviewItem['company']>,
  reviewer: string,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(approveNewSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;

  const instants = proposedInstants(proposed);
  if (instants.length === 0) {
    return {
      status: 'error',
      message: 'The source lists no performances. Use Edit then approve to add them.',
    };
  }
  if (input.publish && !company.inScope) {
    return fieldError(formData, {
      publish: [`${company.name} is out of scope, so its productions can’t be published.`],
    });
  }

  const [venue] = await db()
    .select({ id: venues.id, timezone: regions.timezone })
    .from(venues)
    .innerJoin(regions, eq(venues.regionId, regions.id))
    .where(eq(venues.id, input.venueId))
    .limit(1);
  if (!venue) return fieldError(formData, { venueId: ['That venue no longer exists'] });
  const { startDate, endDate } = localDateRange(instants, venue.timezone)!;

  let work: { id: string; title: string } | undefined;
  if (input.work !== 'new') {
    [work] = await db()
      .select({ id: works.id, title: works.title })
      .from(works)
      .where(eq(works.id, input.work))
      .limit(1);
    if (!work) return fieldError(formData, { work: ['That work no longer exists'] });

    const [other] = await db()
      .select({ startDate: productions.startDate, endDate: productions.endDate })
      .from(productions)
      .where(
        and(
          eq(productions.companyId, company.id),
          eq(productions.workId, work.id),
          lte(productions.startDate, endDate),
          gte(productions.endDate, startDate),
        ),
      )
      .limit(1);
    if (other) {
      return fieldError(
        formData,
        { work: ['Overlaps an existing production'] },
        `${company.name} already has ${work.title} on ${formatDateRange(other.startDate, other.endDate)}. Merge into it instead.`,
      );
    }
  } else {
    const [existing] = await db()
      .select({ title: works.title })
      .from(works)
      .where(eq(works.normalizedTitle, normalizeTitle(input.newWorkTitle)))
      .limit(1);
    if (existing) {
      return fieldError(formData, {
        newWorkTitle: [`“${existing.title}” already exists. Pick it above instead.`],
      });
    }
  }

  const title = work?.title ?? input.newWorkTitle;
  const slug = await generateSlug(
    productions,
    `${title} ${company.name} ${startDate.slice(0, 4)}`,
    'production',
  );
  const newWork =
    input.work === 'new'
      ? {
          title: input.newWorkTitle,
          slug: await generateSlug(works, input.newWorkTitle, 'work'),
          normalizedTitle: normalizeTitle(input.newWorkTitle),
          type: input.newWorkType!,
        }
      : undefined;

  let failed: FormState | undefined;
  try {
    failed = await inTransaction(async (tx) => {
      let workId = work?.id;
      if (newWork) {
        const [created] = await tx.insert(works).values(newWork).returning({ id: works.id });
        workId = created!.id;
      }
      const [production] = await tx
        .insert(productions)
        .values({
          slug,
          workId: workId!,
          companyId: company.id,
          venueId: venue.id,
          startDate,
          endDate,
          priceMin: money(proposed.priceMin),
          priceMax: money(proposed.priceMax),
          ticketUrl: ticketUrl(proposed.ticketUrl),
          advisory: proposed.advisory?.trim().slice(0, 500) || null,
          runtimeMin: runtime(proposed.runtimeMin),
          status: input.publish ? 'published' : 'draft',
        })
        .returning({ id: productions.id });
      await tx
        .insert(performances)
        .values(instants.map((startsAt) => ({ productionId: production!.id, startsAt })));
      await learnAltTitle(tx, workId!, proposed.title);
      await closeReviewItem(tx, id, {
        status: 'approved',
        reviewer,
        productionId: production!.id,
      });
    });
  } catch (err) {
    // Another save took the generated slug between the check and the insert.
    if (isUniqueViolation(err)) {
      return { status: 'error', message: 'Something else was saved at the same time. Try again.' };
    }
    throw err;
  }
  if (failed) return failed;
  return next(id);
}

/**
 * Merge the item into an existing production of the same company: add its
 * upcoming performances and changed facts (never removing anything), and
 * learn its title as an alt title so the next run matches that production.
 */
export async function mergeReviewItem(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(mergeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const loaded = await pendingItem(id);
  if (!loaded.ok) return loaded.state;
  const { proposed, company } = loaded.item;
  if (!proposed || !company) {
    return { status: 'error', message: 'This item has no production to merge.' };
  }
  if (loaded.item.item.productionId) {
    return { status: 'error', message: 'This is already an update to a production. Approve it.' };
  }
  const { productionId } = parsed.data;

  const failed = await inTransaction(async (tx) => {
    const production = await loadDedupProduction(tx, productionId);
    if (!production || production.companyId !== company.id) {
      throw new MergeTargetError();
    }
    const diff = additiveDiff(diffProduction(production, proposed, new Date()));
    await applyProductionDiff(tx, productionId, diff);
    await learnAltTitle(tx, production.workId, proposed.title);
    await closeReviewItem(tx, id, { status: 'merged', reviewer: email, productionId });
  }).catch((err: unknown) => {
    if (err instanceof MergeTargetError) {
      return fieldError(formData, {
        productionId: [`Pick one of ${company.name}’s productions`],
      });
    }
    throw err;
  });
  if (failed) return failed;
  return next(id);
}

class MergeTargetError extends Error {}

export async function rejectReviewItem(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(rejectSchema, formData);
  if (!parsed.ok) return parsed.state;
  const failed = await inTransaction((tx) =>
    closeReviewItem(tx, id, {
      status: 'rejected',
      reviewer: email,
      rejectReason: parsed.data.reason,
    }),
  );
  if (failed) return failed;
  return next(id);
}

/**
 * The source's item isn't a production; the runner won't queue this candidate
 * key from it again. With a keyword, also adds a filter rule for the source
 * (#26) and closes its other pending items the rule matches.
 */
export async function markNotAShow(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = parseForm(notAShowSchema, formData);
  if (!parsed.ok) return parsed.state;
  const loaded = await pendingItem(id);
  if (!loaded.ok) return loaded.state;
  const { sourceId, candidateKey } = loaded.item.item;
  if (!sourceId || !candidateKey) {
    return {
      status: 'error',
      message: 'Only items from a source can be marked “not a show”. Reject it instead.',
    };
  }
  const { keyword } = parsed.data;
  const title = loaded.item.proposed?.title ?? '';
  if (keyword && !titleHasKeyword(title, keyword)) {
    return fieldError(formData, {
      keyword: [`“${keyword}” isn’t in this title. Use words from “${title}”.`],
    });
  }
  const failed = await inTransaction(async (tx) => {
    await closeReviewItem(tx, id, { status: 'not_a_show', reviewer: email });
    if (keyword) {
      await addFilterRule(tx, { sourceId, keyword, createdBy: email, reviewItemId: id });
      await closeMatchingPending(tx, { sourceId, keyword }, email);
    }
  });
  if (failed) return failed;
  if (keyword) revalidatePath('/admin/filter-rules');
  return next(id);
}
