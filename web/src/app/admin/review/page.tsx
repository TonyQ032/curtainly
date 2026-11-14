import type { Metadata } from 'next';
import Link from 'next/link';
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  SOURCE_KINDS,
  type ProductionDiff,
  type SourceKind,
  type WorkMatch,
} from '@curtainly/shared';
import { companies, regions, reviewItems, sources } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';
import { SOURCE_KIND_LABELS } from '../sources/config';
import { formatWhen } from '../sources/health';
import {
  diffSummary,
  performanceSummary,
  proposedTitle,
  REVIEW_TYPE_LABELS,
  REVIEW_TYPES,
  reviewType,
  topSuggestion,
} from './summary';

export const metadata: Metadata = { title: 'Review queue' };

/** Used for performance dates when an item has no company (and so no Region). */
const FALLBACK_TIME_ZONE = 'America/Los_Angeles';

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type Row = {
  id: string;
  productionId: string | null;
  proposed: unknown;
  diff: ProductionDiff | null;
  matchSuggestions: WorkMatch[];
  createdAt: Date;
  sourceId: string | null;
  sourceKind: SourceKind | null;
  companyName: string | null;
  timeZone: string | null;
};

const dash = <span className="muted">–</span>;

const columns: Column<Row>[] = [
  {
    key: 'title',
    header: 'Title',
    cell: (r) => (
      <strong>
        <Link href={`/admin/review/${r.id}`}>{proposedTitle(r.proposed)}</Link>
      </strong>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    cell: (r) => {
      const type = reviewType(r.productionId);
      return (
        <span className={type === 'new' ? 'badge accent' : 'badge'}>
          {REVIEW_TYPE_LABELS[type]}
        </span>
      );
    },
  },
  { key: 'company', header: 'Company', cell: (r) => r.companyName ?? dash },
  {
    key: 'source',
    header: 'Source',
    cell: (r) =>
      r.sourceId && r.sourceKind ? (
        <Link href={`/admin/sources/${r.sourceId}`}>{SOURCE_KIND_LABELS[r.sourceKind]}</Link>
      ) : (
        dash
      ),
  },
  {
    key: 'performances',
    header: 'Performances',
    cell: (r) => performanceSummary(r.proposed, r.timeZone ?? FALLBACK_TIME_ZONE) ?? dash,
  },
  {
    key: 'details',
    header: 'Changes / best Work match',
    cell: (r) => {
      if (r.productionId) {
        return (
          <>
            {diffSummary(r.diff)}{' '}
            <Link href={`/admin/productions/${r.productionId}`} className="muted">
              (production)
            </Link>
          </>
        );
      }
      return topSuggestion(r.matchSuggestions) ?? <span className="muted">No match</span>;
    },
  },
  { key: 'queued', header: 'Queued', cell: (r) => formatWhen(r.createdAt) },
];

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const kind = SOURCE_KINDS.find((k) => k === one(sp.source));
  const type = REVIEW_TYPES.find((t) => t === one(sp.type));

  const pattern = likePattern(q);
  const conditions: (SQL | undefined)[] = [
    eq(reviewItems.status, 'pending'),
    q
      ? or(ilike(sql`${reviewItems.proposed}->>'title'`, pattern), ilike(companies.name, pattern))
      : undefined,
    kind ? eq(sources.kind, kind) : undefined,
    type === 'new' ? isNull(reviewItems.productionId) : undefined,
    type === 'update' ? isNotNull(reviewItems.productionId) : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db()
      .select({
        id: reviewItems.id,
        productionId: reviewItems.productionId,
        proposed: reviewItems.proposed,
        diff: reviewItems.diff,
        matchSuggestions: reviewItems.matchSuggestions,
        createdAt: reviewItems.createdAt,
        sourceId: reviewItems.sourceId,
        sourceKind: sources.kind,
        companyName: companies.name,
        timeZone: regions.timezone,
      })
      .from(reviewItems)
      .leftJoin(sources, eq(reviewItems.sourceId, sources.id))
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .leftJoin(regions, eq(companies.regionId, regions.id))
      .where(where)
      .orderBy(desc(reviewItems.createdAt), desc(reviewItems.id))
      .limit(pageSize)
      .offset(offset),
    db()
      .select({ total: count() })
      .from(reviewItems)
      .leftJoin(sources, eq(reviewItems.sourceId, sources.id))
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  const filtered = Boolean(q || kind || type);

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Pending items from sources and submissions, newest first."
      />
      <ListToolbar
        q={q}
        placeholder="Search by title or company"
        filters={
          <>
            <FilterSelect
              name="source"
              label="Source"
              value={kind}
              options={SOURCE_KINDS.map((k) => ({ value: k, label: SOURCE_KIND_LABELS[k] }))}
            />
            <FilterSelect
              name="type"
              label="Type"
              value={type}
              options={REVIEW_TYPES.map((t) => ({ value: t, label: REVIEW_TYPE_LABELS[t] }))}
            />
          </>
        }
      >
        {filtered && <Link href="/admin/review">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={filtered ? 'No pending items match these filters.' : 'Nothing to review.'}
      />
      <Pagination
        pathname="/admin/review"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
