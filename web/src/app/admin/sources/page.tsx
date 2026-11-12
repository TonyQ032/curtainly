import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm';
import { SOURCE_HEALTH, SOURCE_KINDS, type SourceHealth, type SourceKind } from '@curtainly/shared';
import { companies, sources } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';
import { SOURCE_KIND_LABELS } from './config';
import { formatWhen, HealthBadge } from './health';

export const metadata: Metadata = { title: 'Sources' };

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function yesNo(v: string | undefined): boolean | undefined {
  return v === 'yes' ? true : v === 'no' ? false : undefined;
}

type Row = {
  id: string;
  companyName: string;
  kind: SourceKind;
  enabled: boolean;
  autoApprove: boolean;
  health: SourceHealth;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastItemCount: number | null;
  lastError: string | null;
};

const dash = <span className="muted">–</span>;

const columns: Column<Row>[] = [
  {
    key: 'company',
    header: 'Company',
    cell: (r) => <Link href={`/admin/sources/${r.id}`}>{r.companyName}</Link>,
  },
  { key: 'kind', header: 'Kind', cell: (r) => SOURCE_KIND_LABELS[r.kind] },
  {
    key: 'enabled',
    header: 'Enabled',
    cell: (r) => (r.enabled ? 'Yes' : <span className="muted">No</span>),
  },
  {
    key: 'auto',
    header: 'Auto-approve',
    cell: (r) => (r.autoApprove ? 'Yes' : <span className="muted">No</span>),
  },
  { key: 'health', header: 'Health', cell: (r) => <HealthBadge health={r.health} /> },
  { key: 'lastRun', header: 'Last run', cell: (r) => formatWhen(r.lastRunAt) ?? dash },
  { key: 'lastSuccess', header: 'Last success', cell: (r) => formatWhen(r.lastSuccessAt) ?? dash },
  { key: 'items', header: 'Items', cell: (r) => r.lastItemCount ?? dash, numeric: true },
  {
    key: 'error',
    header: 'Last error',
    cell: (r) => (r.lastError ? <span title={r.lastError}>{r.lastError.slice(0, 60)}</span> : dash),
  },
];

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const saved = one(sp.saved);
  const kind = SOURCE_KINDS.find((k) => k === one(sp.kind));
  const health = SOURCE_HEALTH.find((h) => h === one(sp.health));
  const enabled = yesNo(one(sp.enabled));

  const conditions: (SQL | undefined)[] = [
    q ? ilike(companies.name, likePattern(q)) : undefined,
    kind ? eq(sources.kind, kind) : undefined,
    health ? eq(sources.health, health) : undefined,
    enabled === undefined ? undefined : eq(sources.enabled, enabled),
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db()
      .select({
        id: sources.id,
        companyName: companies.name,
        kind: sources.kind,
        enabled: sources.enabled,
        autoApprove: sources.autoApprove,
        health: sources.health,
        lastRunAt: sources.lastRunAt,
        lastSuccessAt: sources.lastSuccessAt,
        lastItemCount: sources.lastItemCount,
        lastError: sources.lastError,
      })
      .from(sources)
      .innerJoin(companies, eq(sources.companyId, companies.id))
      .where(where)
      .orderBy(asc(companies.name), asc(sources.kind))
      .limit(pageSize)
      .offset(offset),
    db()
      .select({ total: count() })
      .from(sources)
      .innerJoin(companies, eq(sources.companyId, companies.id))
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  const filtered = Boolean(q || kind || health || enabled !== undefined);

  return (
    <>
      <PageHeader
        title="Sources"
        description="How listings reach Curtainly: one row per company and platform."
        actions={
          <Link href="/admin/sources/new" className="button primary">
            New source
          </Link>
        }
      />
      {saved && (
        <p role="status" className="success notice">
          Source saved.
        </p>
      )}
      <ListToolbar
        q={q}
        placeholder="Search by company"
        filters={
          <>
            <FilterSelect
              name="kind"
              label="Kind"
              value={kind}
              options={SOURCE_KINDS.map((k) => ({ value: k, label: SOURCE_KIND_LABELS[k] }))}
            />
            <FilterSelect
              name="health"
              label="Health"
              value={health}
              options={SOURCE_HEALTH.map((h) => ({ value: h, label: h }))}
            />
            <FilterSelect name="enabled" label="Enabled" value={one(sp.enabled)} options={YES_NO} />
          </>
        }
      >
        {filtered && <Link href="/admin/sources">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={filtered ? 'No sources match these filters.' : 'No sources yet. Add the first one.'}
      />
      <Pagination
        pathname="/admin/sources"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
