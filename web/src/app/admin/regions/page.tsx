import type { Metadata } from 'next';
import { asc, count, ilike, or } from 'drizzle-orm';
import { regions } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';

export const metadata: Metadata = { title: 'Regions' };

type Region = typeof regions.$inferSelect;

const columns: Column<Region>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'slug', header: 'Slug', cell: (r) => <code>{r.slug}</code> },
  { key: 'timezone', header: 'Timezone', cell: (r) => r.timezone },
  {
    key: 'center',
    header: 'Center (lat, lng)',
    cell: (r) => `${r.center.y.toFixed(3)}, ${r.center.x.toFixed(3)}`,
  },
  { key: 'radius', header: 'Radius (mi)', cell: (r) => r.radiusMiles, numeric: true },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <span className={`badge ${r.status}`}>{r.status}</span>,
  },
];

/**
 * Reference list page for the admin pattern: requireAdmin → parseListParams →
 * one query for rows + one for the total → DataTable + Pagination.
 * Create and edit arrive with #10.
 */
export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);

  const where = q
    ? or(ilike(regions.name, likePattern(q)), ilike(regions.slug, likePattern(q)))
    : undefined;

  const [rows, totals] = await Promise.all([
    db()
      .select()
      .from(regions)
      .where(where)
      .orderBy(asc(regions.name))
      .limit(pageSize)
      .offset(offset),
    db().select({ total: count() }).from(regions).where(where),
  ]);
  const total = totals[0]?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Regions"
        description="Areas Curtainly covers. A region goes live once its coverage is proven."
      />
      <ListToolbar q={q} placeholder="Search regions" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={q ? `No regions match “${q}”.` : 'No regions yet. Run pnpm db:seed.'}
      />
      <Pagination
        pathname="/admin/regions"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
