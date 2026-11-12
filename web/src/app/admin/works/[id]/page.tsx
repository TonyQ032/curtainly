import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from '@curtainly/shared';
import { companies, productions, venues, works } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { formatDateRange } from '@/lib/dates';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { DataTable, type Column } from '../../_components/data-table';
import { PageHeader } from '../../_components/page-header';
import { updateWork } from '../actions';
import { authorsToRows } from '../schema';
import { WorkForm } from '../work-form';

type Props = { params: Promise<{ id: string }> };

async function loadWork(id: string) {
  if (!isUuid(id)) return undefined;
  const [work] = await db().select().from(works).where(eq(works.id, id)).limit(1);
  return work;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const work = await loadWork((await params).id);
  return { title: work ? `Edit ${work.title}` : 'Work not found' };
}

type ProductionRow = {
  id: string;
  companyName: string;
  venueName: string;
  startDate: string;
  endDate: string;
  status: ProductionStatus;
};

const productionColumns: Column<ProductionRow>[] = [
  {
    key: 'company',
    header: 'Company',
    cell: (p) => <Link href={`/admin/productions/${p.id}`}>{p.companyName}</Link>,
  },
  { key: 'venue', header: 'Venue', cell: (p) => p.venueName },
  { key: 'dates', header: 'Dates', cell: (p) => formatDateRange(p.startDate, p.endDate) },
  {
    key: 'status',
    header: 'Status',
    cell: (p) => <span className="badge">{PRODUCTION_STATUS_LABELS[p.status]}</span>,
  },
];

export default async function EditWorkPage({ params }: Props) {
  await requireAdmin();
  const work = await loadWork((await params).id);
  if (!work) notFound();

  const workProductions = await db()
    .select({
      id: productions.id,
      companyName: companies.name,
      venueName: venues.name,
      startDate: productions.startDate,
      endDate: productions.endDate,
      status: productions.status,
    })
    .from(productions)
    .innerJoin(companies, eq(productions.companyId, companies.id))
    .innerJoin(venues, eq(productions.venueId, venues.id))
    .where(eq(productions.workId, work.id))
    .orderBy(desc(productions.startDate));

  return (
    <>
      <PageHeader title={`Edit ${work.title}`} />
      <WorkForm
        action={updateWork.bind(null, work.id)}
        isNew={false}
        defaults={{
          title: work.title,
          slug: work.slug,
          type: work.type,
          altTitles: work.altTitles.join('\n'),
          authors: JSON.stringify(authorsToRows(work.authors)),
        }}
      />
      <p className="muted">
        Matches on <code>{work.normalizedTitle}</code> (the title without case, punctuation, a
        leading &ldquo;The&rdquo; or edition suffixes).
      </p>

      <section className="related">
        <h2>Productions</h2>
        <p className="muted">
          Every company&rsquo;s run of this work.{' '}
          <Link href={`/admin/productions/new?work=${work.id}`}>Add a production</Link>
        </p>
        <DataTable
          columns={productionColumns}
          rows={workProductions}
          rowKey={(p) => p.id}
          empty="No productions yet."
        />
      </section>
    </>
  );
}
