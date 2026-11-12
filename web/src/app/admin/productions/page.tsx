import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_LABELS,
  type ProductionStatus,
} from '@curtainly/shared';
import { companies, productions, regions, venues, works } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { formatDate, formatDateRange, formatTime } from '@/lib/dates';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';

export const metadata: Metadata = { title: 'Productions' };

const WHEN_OPTIONS = [
  { value: 'upcoming', label: 'Running or upcoming' },
  { value: 'past', label: 'Closed' },
];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type Row = {
  id: string;
  slug: string;
  workTitle: string;
  companyName: string;
  venueName: string;
  startDate: string;
  endDate: string;
  status: ProductionStatus;
  familyFriendly: boolean;
  performanceCount: number;
  /** Next performance in the venue's local time, "YYYY-MM-DD HH:MM". */
  nextLocal: string | null;
};

const columns: Column<Row>[] = [
  {
    key: 'work',
    header: 'Production',
    cell: (r) => (
      <>
        <Link href={`/admin/productions/${r.id}`}>{r.workTitle}</Link>
        <br />
        <small className="muted">{r.slug}</small>
      </>
    ),
  },
  { key: 'company', header: 'Company', cell: (r) => r.companyName },
  { key: 'venue', header: 'Venue', cell: (r) => r.venueName },
  { key: 'dates', header: 'Dates', cell: (r) => formatDateRange(r.startDate, r.endDate) },
  {
    key: 'performances',
    header: 'Performances',
    cell: (r) => {
      if (!r.performanceCount) return <span className="muted">None</span>;
      const [date, time] = r.nextLocal?.split(' ') ?? [];
      return (
        <>
          {r.performanceCount}
          {date && time && (
            <>
              <br />
              <small className="muted">
                Next {formatDate(date, { year: false })}, {formatTime(time)}
              </small>
            </>
          )}
        </>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <>
        <span className={r.status === 'published' ? 'badge live' : 'badge'}>
          {PRODUCTION_STATUS_LABELS[r.status]}
        </span>
        {r.familyFriendly && (
          <>
            {' '}
            <span className="badge">Family</span>
          </>
        )}
      </>
    ),
  },
];

/** Productions: one company's run of one work. Newest first. */
export default async function ProductionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const saved = one(sp.saved);
  const status = PRODUCTION_STATUSES.find((s) => s === one(sp.status));
  const when = WHEN_OPTIONS.find((w) => w.value === one(sp.when))?.value;
  const regionId = one(sp.region);

  const allRegions = await db()
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.name));
  const region = allRegions.find((r) => r.id === regionId);

  // "Today" in the venue's region, so a show closing tonight still counts as running.
  const localToday = sql`(now() at time zone ${regions.timezone})::date`;
  const conditions: (SQL | undefined)[] = [
    q
      ? or(
          ilike(works.title, likePattern(q)),
          ilike(companies.name, likePattern(q)),
          ilike(productions.slug, likePattern(q)),
        )
      : undefined,
    status ? eq(productions.status, status) : undefined,
    region ? eq(venues.regionId, region.id) : undefined,
    when === 'upcoming' ? gte(productions.endDate, localToday) : undefined,
    when === 'past' ? lt(productions.endDate, localToday) : undefined,
  ];
  const where = and(...conditions);

  const base = () =>
    db()
      .select({
        id: productions.id,
        slug: productions.slug,
        workTitle: works.title,
        companyName: companies.name,
        venueName: venues.name,
        startDate: productions.startDate,
        endDate: productions.endDate,
        status: productions.status,
        familyFriendly: productions.familyFriendly,
        performanceCount: sql<number>`(
          select count(*) from performances pf where pf.production_id = ${productions.id}
        )`.mapWith(Number),
        nextLocal: sql<string | null>`(
          select to_char(min(pf.starts_at) at time zone ${regions.timezone}, 'YYYY-MM-DD HH24:MI')
          from performances pf
          where pf.production_id = ${productions.id} and pf.starts_at > now()
        )`,
      })
      .from(productions)
      .innerJoin(works, eq(productions.workId, works.id))
      .innerJoin(companies, eq(productions.companyId, companies.id))
      .innerJoin(venues, eq(productions.venueId, venues.id))
      .innerJoin(regions, eq(venues.regionId, regions.id));

  const order =
    when === 'upcoming'
      ? [asc(productions.startDate), asc(works.title)]
      : [desc(productions.startDate), asc(works.title)];

  const [rows, totals] = await Promise.all([
    base()
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset(offset),
    db()
      .select({ total: count() })
      .from(productions)
      .innerJoin(works, eq(productions.workId, works.id))
      .innerJoin(companies, eq(productions.companyId, companies.id))
      .innerJoin(venues, eq(productions.venueId, venues.id))
      .innerJoin(regions, eq(venues.regionId, regions.id))
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  const filtered = Boolean(q || status || region || when);

  return (
    <>
      <PageHeader
        title="Productions"
        description="One company's run of one work, with its performances."
        actions={
          <Link href="/admin/productions/new" className="button primary">
            New production
          </Link>
        }
      />
      {saved && (
        <p role="status" className="success notice">
          Saved <code>{saved}</code>.
        </p>
      )}
      <ListToolbar
        q={q}
        placeholder="Search work, company or slug"
        filters={
          <>
            <FilterSelect
              name="status"
              label="Status"
              value={status}
              options={PRODUCTION_STATUSES.map((s) => ({
                value: s,
                label: PRODUCTION_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect name="when" label="When" value={when} options={WHEN_OPTIONS} />
            <FilterSelect
              name="region"
              label="Region"
              value={region?.id}
              options={allRegions.map((r) => ({ value: r.id, label: r.name }))}
            />
          </>
        }
      >
        {filtered && <Link href="/admin/productions">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          filtered
            ? 'No productions match these filters.'
            : 'No productions yet. Add the first one.'
        }
      />
      <Pagination
        pathname="/admin/productions"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
