import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { WORK_TYPES, WORK_TYPE_LABELS, creditLines, type WorkType } from '@curtainly/shared';
import { works, type WorkAuthors } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';

export const metadata: Metadata = { title: 'Works' };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type Row = {
  id: string;
  title: string;
  type: WorkType;
  altTitles: string[];
  authors: WorkAuthors;
  productionCount: number;
};

const columns: Column<Row>[] = [
  {
    key: 'title',
    header: 'Title',
    cell: (r) => (
      <>
        <Link href={`/admin/works/${r.id}`}>{r.title}</Link>
        {r.altTitles.length > 0 && (
          <>
            <br />
            <small className="muted">Also: {r.altTitles.join(' · ')}</small>
          </>
        )}
      </>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    cell: (r) => <span className="badge">{WORK_TYPE_LABELS[r.type]}</span>,
  },
  {
    key: 'credits',
    header: 'Credits',
    cell: (r) => {
      const lines = creditLines(r.authors);
      return lines.length ? (
        lines.map((line) => <div key={line}>{line}</div>)
      ) : (
        <span className="muted">–</span>
      );
    },
  },
  { key: 'productions', header: 'Productions', cell: (r) => r.productionCount, numeric: true },
];

/** Works: the shows themselves, shared by every production of them. */
export default async function WorksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const saved = one(sp.saved);
  const type = WORK_TYPES.find((t) => t === one(sp.type));

  const conditions: (SQL | undefined)[] = [
    q
      ? or(
          ilike(works.title, likePattern(q)),
          ilike(works.slug, likePattern(q)),
          sql`array_to_string(${works.altTitles}, ' ') ilike ${likePattern(q)}`,
        )
      : undefined,
    type ? eq(works.type, type) : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db()
      .select({
        id: works.id,
        title: works.title,
        type: works.type,
        altTitles: works.altTitles,
        authors: works.authors,
        productionCount:
          sql<number>`(select count(*) from productions p where p.work_id = ${works.id})`.mapWith(
            Number,
          ),
      })
      .from(works)
      .where(where)
      .orderBy(asc(works.normalizedTitle), asc(works.title))
      .limit(pageSize)
      .offset(offset),
    db().select({ total: count() }).from(works).where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  const filtered = Boolean(q || type);

  return (
    <>
      <PageHeader
        title="Works"
        description="The shows themselves. Every production of a show points to one work."
        actions={
          <Link href="/admin/works/new" className="button primary">
            New work
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
        placeholder="Search titles"
        filters={
          <FilterSelect
            name="type"
            label="Type"
            value={type}
            options={WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABELS[t] }))}
          />
        }
      >
        {filtered && <Link href="/admin/works">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={filtered ? 'No works match these filters.' : 'No works yet. Add the first one.'}
      />
      <Pagination
        pathname="/admin/works"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
