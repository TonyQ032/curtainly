import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, ilike, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { NON_ADAPTER_SOURCE_KINDS, type SourceKind } from '@curtainly/shared';
import { companies, filterRules, sources } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';
import { SOURCE_KIND_LABELS } from '../sources/config';
import { formatWhen } from '../sources/health';
import { deleteFilterRule } from './actions';
import { FilterRuleForm } from './rule-form';

export const metadata: Metadata = { title: 'Filter rules' };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const sourceLabel = (companyName: string, kind: SourceKind) =>
  `${companyName} · ${SOURCE_KIND_LABELS[kind]}`;

type Row = {
  id: string;
  keyword: string;
  sourceId: string | null;
  companyName: string | null;
  kind: SourceKind | null;
  createdBy: string | null;
  createdAt: Date;
  reviewItemId: string | null;
};

const columns: Column<Row>[] = [
  { key: 'keyword', header: 'Keyword', cell: (r) => <code>{r.keyword}</code> },
  {
    key: 'scope',
    header: 'Applies to',
    cell: (r) =>
      r.sourceId && r.companyName && r.kind ? (
        <Link href={`/admin/sources/${r.sourceId}`}>{sourceLabel(r.companyName, r.kind)}</Link>
      ) : (
        <span className="badge accent">Every source</span>
      ),
  },
  {
    key: 'added',
    header: 'Added',
    cell: (r) => (
      <>
        {r.createdBy ?? <span className="muted">Built in</span>}
        <span className="muted"> · {formatWhen(r.createdAt)}</span>
        {r.reviewItemId && (
          <>
            {' '}
            · <Link href={`/admin/review/${r.reviewItemId}`}>from review</Link>
          </>
        )}
      </>
    ),
  },
  {
    key: 'remove',
    header: 'Actions',
    cell: (r) => (
      <form action={deleteFilterRule.bind(null, r.id)}>
        <button type="submit" aria-label={`Remove rule “${r.keyword}”`}>
          Remove
        </button>
      </form>
    ),
  },
];

/**
 * Non-show filter rules (#26): ingested listings whose title contains a
 * keyword are counted but never queued. Global, or for one source.
 */
export default async function FilterRulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const scopeParam = one(sp.scope);
  const scope = scopeParam === 'global' || (scopeParam && isUuid(scopeParam)) ? scopeParam : '';
  const added = one(sp.added);
  const closed = Number.parseInt(one(sp.closed) ?? '', 10) || 0;

  const conditions: (SQL | undefined)[] = [
    q ? ilike(filterRules.keyword, likePattern(q)) : undefined,
    scope === 'global'
      ? isNull(filterRules.sourceId)
      : scope
        ? eq(filterRules.sourceId, scope)
        : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals, sourceRows] = await Promise.all([
    db()
      .select({
        id: filterRules.id,
        keyword: filterRules.keyword,
        sourceId: filterRules.sourceId,
        companyName: companies.name,
        kind: sources.kind,
        createdBy: filterRules.createdBy,
        createdAt: filterRules.createdAt,
        reviewItemId: filterRules.reviewItemId,
      })
      .from(filterRules)
      .leftJoin(sources, eq(filterRules.sourceId, sources.id))
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(where)
      // Global rules first, then by source, then alphabetically.
      .orderBy(
        sql`${filterRules.sourceId} is not null`,
        asc(companies.name),
        asc(filterRules.keyword),
      )
      .limit(pageSize)
      .offset(offset),
    db().select({ total: count() }).from(filterRules).where(where),
    db()
      .select({ id: sources.id, companyName: companies.name, kind: sources.kind })
      .from(sources)
      .innerJoin(companies, eq(sources.companyId, companies.id))
      .where(notInArray(sources.kind, [...NON_ADAPTER_SOURCE_KINDS]))
      .orderBy(asc(companies.name), asc(sources.kind)),
  ]);
  const total = totals[0]?.total ?? 0;
  const sourceOptions = sourceRows.map((s) => ({
    id: s.id,
    label: sourceLabel(s.companyName, s.kind),
  }));
  const filtered = Boolean(q || scope);

  return (
    <>
      <PageHeader
        title="Filter rules"
        description="Galas, classes, camps and other non-shows. Ingested listings whose title contains a keyword are counted on each run but never queued."
      />
      {added && (
        <p role="status" className="success notice">
          Added <code>{added}</code>.
          {closed > 0 &&
            ` Closed ${closed} pending review item${closed === 1 ? '' : 's'} it matches as “not a show”.`}
        </p>
      )}

      <section className="related">
        <h2>Add a rule</h2>
        <FilterRuleForm
          sources={sourceOptions}
          defaultScope={scope && scope !== 'global' ? scope : 'global'}
        />
      </section>

      <section className="related">
        <h2>Rules</h2>
        <ListToolbar
          q={q}
          placeholder="Search keywords"
          filters={
            <FilterSelect
              name="scope"
              label="Applies to"
              value={scope || undefined}
              options={[{ value: 'global', label: 'Every source' }].concat(
                sourceOptions.map((s) => ({ value: s.id, label: s.label })),
              )}
            />
          }
        >
          {filtered && <Link href="/admin/filter-rules">Clear filters</Link>}
        </ListToolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={filtered ? 'No rules match these filters.' : 'No rules yet.'}
        />
        <Pagination
          pathname="/admin/filter-rules"
          searchParams={sp}
          page={page}
          pageSize={pageSize}
          total={total}
        />
      </section>
    </>
  );
}
