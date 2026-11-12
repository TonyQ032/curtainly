import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { TIERS, TIER_LABELS, type Tier } from '@curtainly/shared';
import { companies, regions } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';

export const metadata: Metadata = { title: 'Companies' };

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
  name: string;
  slug: string;
  tier: Tier;
  website: string | null;
  inScope: boolean;
  active: boolean;
  regionName: string;
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const columns: Column<Row>[] = [
  {
    key: 'name',
    header: 'Name',
    cell: (r) => <Link href={`/admin/companies/${r.id}`}>{r.name}</Link>,
  },
  {
    key: 'tier',
    header: 'Tier',
    cell: (r) => <span className="badge">{TIER_LABELS[r.tier]}</span>,
  },
  { key: 'region', header: 'Region', cell: (r) => r.regionName },
  {
    key: 'inScope',
    header: 'In scope',
    cell: (r) => (r.inScope ? 'Yes' : <span className="muted">No</span>),
  },
  {
    key: 'active',
    header: 'Active',
    cell: (r) => (r.active ? 'Yes' : <span className="muted">No</span>),
  },
  {
    key: 'website',
    header: 'Website',
    cell: (r) =>
      r.website ? (
        <a href={r.website} target="_blank" rel="noreferrer">
          {hostname(r.website)}
        </a>
      ) : (
        <span className="muted">–</span>
      ),
  },
];

/** The registry. Filters are GET params, so every filtered view is a link. */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const saved = one(sp.saved);
  const tier = TIERS.find((t) => t === one(sp.tier));
  const regionId = one(sp.region);
  const inScope = yesNo(one(sp.inScope));
  const active = yesNo(one(sp.active));

  const allRegions = await db()
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.name));
  const region = allRegions.find((r) => r.id === regionId);

  const conditions: (SQL | undefined)[] = [
    q
      ? or(ilike(companies.name, likePattern(q)), ilike(companies.slug, likePattern(q)))
      : undefined,
    tier ? eq(companies.tier, tier) : undefined,
    region ? eq(companies.regionId, region.id) : undefined,
    inScope === undefined ? undefined : eq(companies.inScope, inScope),
    active === undefined ? undefined : eq(companies.active, active),
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db()
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        tier: companies.tier,
        website: companies.website,
        inScope: companies.inScope,
        active: companies.active,
        regionName: regions.name,
      })
      .from(companies)
      .innerJoin(regions, eq(companies.regionId, regions.id))
      .where(where)
      .orderBy(asc(companies.name))
      .limit(pageSize)
      .offset(offset),
    db().select({ total: count() }).from(companies).where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  const filtered = Boolean(q || tier || region || inScope !== undefined || active !== undefined);

  return (
    <>
      <PageHeader
        title="Companies"
        description="The registry: every producing organization, in scope or not."
        actions={
          <Link href="/admin/companies/new" className="button primary">
            New company
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
        placeholder="Search companies"
        filters={
          <>
            <FilterSelect
              name="tier"
              label="Tier"
              value={tier}
              options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))}
            />
            <FilterSelect
              name="region"
              label="Region"
              value={region?.id}
              options={allRegions.map((r) => ({ value: r.id, label: r.name }))}
            />
            <FilterSelect
              name="inScope"
              label="In scope"
              value={one(sp.inScope)}
              options={YES_NO}
            />
            <FilterSelect name="active" label="Active" value={one(sp.active)} options={YES_NO} />
          </>
        }
      >
        {filtered && <Link href="/admin/companies">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          filtered ? 'No companies match these filters.' : 'No companies yet. Add the first one.'
        }
      />
      <Pagination
        pathname="/admin/companies"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
