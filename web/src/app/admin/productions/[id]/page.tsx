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
import { updateProduction } from '../actions';
import { loadFormOptions, priceInput } from '../options';
import type { PerformanceRow } from '../performances';
import { ProductionForm } from '../production-form';

type Props = { params: Promise<{ id: string }> };

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

export default async function EditProductionPage({ params }: Props) {
  await requireAdmin();
  const row = await loadProduction((await params).id);
  if (!row) notFound();
  const { production: p, work, timezone } = row;

  const [options, perfs] = await Promise.all([
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
  ]);

  // Shown in the venue's local time; saved back from it.
  const rows: PerformanceRow[] = perfs.map((perf) => ({
    ...utcToZoned(perf.startsAt, timezone),
    venueId: perf.venueId ?? '',
    notes: perf.notes ?? '',
  }));

  return (
    <>
      <PageHeader title={`Edit ${work.title}`} description={row.companyName} />
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
          startDate: p.startDate,
          endDate: p.endDate,
          priceMin: priceInput(p.priceMin),
          priceMax: priceInput(p.priceMax),
          ticketUrl: p.ticketUrl ?? '',
          advisory: p.advisory ?? '',
          runtimeMin: p.runtimeMin?.toString() ?? '',
          familyFriendly: p.familyFriendly ? 'on' : '',
          status: p.status,
          performances: JSON.stringify(rows),
        }}
      />
    </>
  );
}
