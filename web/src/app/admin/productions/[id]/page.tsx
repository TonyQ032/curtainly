import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { utcToZoned } from '@curtainly/shared';
import {
  companies,
  performances,
  productions,
  regions,
  venues,
  works,
} from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { PageHeader } from '../../_components/page-header';
import { pendingUpdate } from '../../review/review-data';
import { applyDiffToRows, priceText } from '../../review/review-item';
import { updateProduction } from '../actions';
import { loadFormOptions, priceInput } from '../options';
import type { PerformanceRow } from '../performances';
import { ProductionForm } from '../production-form';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
};

async function loadProduction(id: string) {
  if (!isUuid(id)) return undefined;
  const [row] = await db()
    .select({
      production: productions,
      work: { id: works.id, title: works.title, type: works.type },
      companyName: companies.name,
      timezone: regions.timezone,
    })
    .from(productions)
    .innerJoin(works, eq(productions.workId, works.id))
    .innerJoin(companies, eq(productions.companyId, companies.id))
    .innerJoin(venues, eq(productions.venueId, venues.id))
    .innerJoin(regions, eq(venues.regionId, regions.id))
    .where(eq(productions.id, id))
    .limit(1);
  return row;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const row = await loadProduction((await params).id);
  return { title: row ? `Edit ${row.work.title}` : 'Production not found' };
}

/** `?review=<id>` applies a pending update item's changes to the form ("edit then approve"). */
export default async function EditProductionPage({ params, searchParams }: Props) {
  await requireAdmin();
  const row = await loadProduction((await params).id);
  if (!row) notFound();
  const { production: p, work, timezone } = row;
  const reviewParam = (await searchParams).review;

  const [options, perfs, review] = await Promise.all([
    loadFormOptions(),
    db()
      .select({
        startsAt: performances.startsAt,
        venueId: performances.venueId,
        notes: performances.notes,
      })
      .from(performances)
      .where(eq(performances.productionId, p.id))
      .orderBy(asc(performances.startsAt)),
    pendingUpdate(Array.isArray(reviewParam) ? reviewParam[0] : reviewParam, p.id),
  ]);

  // Shown in the venue's local time; saved back from it.
  const current: PerformanceRow[] = perfs.map((perf) => ({
    ...utcToZoned(perf.startsAt, timezone),
    venueId: perf.venueId ?? '',
    notes: perf.notes ?? '',
  }));
  const rows = review ? applyDiffToRows(current, review.diff, timezone) : current;
  const changed = new Map(review?.diff.fields.map((f) => [f.field, f.to]));
  const text = (field: 'ticketUrl' | 'advisory' | 'runtimeMin', value: string) =>
    changed.has(field) ? String(changed.get(field)) : value;
  const money = (field: 'priceMin' | 'priceMax', value: string | null) =>
    changed.has(field) ? priceText(changed.get(field)) : priceInput(value);
  const dates = review?.diff.dates?.to;

  return (
    <>
      <PageHeader
        title={`Edit ${work.title}`}
        description={
          review
            ? `${row.companyName} · The source’s changes are applied below. Save to approve them.`
            : row.companyName
        }
      />
      {reviewParam && !review && (
        <p className="callout">That review item isn’t a pending update to this production.</p>
      )}
      <ProductionForm
        action={updateProduction.bind(null, p.id)}
        isNew={false}
        companies={options.companies}
        venues={options.venues}
        defaults={{
          workId: work.id,
          workLabel: JSON.stringify(work),
          newWorkTitle: '',
          newWorkType: '',
          companyId: p.companyId,
          venueId: p.venueId,
          slug: p.slug,
          // The diff only widens the run, even if the production changed since.
          startDate: dates && dates.startDate < p.startDate ? dates.startDate : p.startDate,
          endDate: dates && dates.endDate > p.endDate ? dates.endDate : p.endDate,
          priceMin: money('priceMin', p.priceMin),
          priceMax: money('priceMax', p.priceMax),
          ticketUrl: text('ticketUrl', p.ticketUrl ?? ''),
          advisory: text('advisory', p.advisory ?? ''),
          runtimeMin: text('runtimeMin', p.runtimeMin?.toString() ?? ''),
          familyFriendly: p.familyFriendly ? 'on' : '',
          status: p.status,
          performances: JSON.stringify(rows),
          reviewItemId: review?.id,
        }}
      />
    </>
  );
}
