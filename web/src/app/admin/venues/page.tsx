import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { regions, venues } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { osmMapUrl } from '@/lib/geo';
import { likePattern, parseListParams, type SearchParams } from '@/lib/list-params';
import { DataTable, type Column } from '../_components/data-table';
import { FilterSelect, ListToolbar } from '../_components/list-toolbar';
import { PageHeader } from '../_components/page-header';
import { Pagination } from '../_components/pagination';
import type { GeoNotice } from './actions';

export const metadata: Metadata = { title: 'Venues' };

const GEO_MESSAGES: Record<GeoNotice, string> = {
  not_found: 'but no map location was found for that address. Check it, or type the coordinates.',
  error: 'but the map lookup failed. Try saving again, or type the coordinates.',
  disabled: 'but map lookups are switched off (GEOCODER=off). Type the coordinates.',
  outside:
    'but its map location is outside the region’s radius. Check the address and the point on the map.',
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type Row = {
  id: string;
  name: string;
  address: string;
  regionName: string;
  location: { x: number; y: number } | null;
};

const columns: Column<Row>[] = [
  {
    key: 'name',
    header: 'Name',
    cell: (r) => <Link href={`/admin/venues/${r.id}`}>{r.name}</Link>,
  },
  { key: 'address', header: 'Address', cell: (r) => r.address },
  { key: 'region', header: 'Region', cell: (r) => r.regionName },
  {
    key: 'location',
    header: 'Map location',
    cell: (r) =>
      r.location ? (
        <a href={osmMapUrl(r.location.y, r.location.x)} target="_blank" rel="noreferrer">
          {r.location.y.toFixed(4)}, {r.location.x.toFixed(4)}
        </a>
      ) : (
        <span className="badge accent">Missing</span>
      ),
  },
];

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { q, page, pageSize, offset } = parseListParams(sp);
  const saved = one(sp.saved);
  const geo = one(sp.geo) as GeoNotice | undefined;
  const regionId = one(sp.region);
  const located = one(sp.located);

  const allRegions = await db()
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.name));
  const region = allRegions.find((r) => r.id === regionId);

  const where = and(
    ...([
      q
        ? or(
            ilike(venues.name, likePattern(q)),
            ilike(venues.address, likePattern(q)),
            ilike(venues.slug, likePattern(q)),
          )
        : undefined,
      region ? eq(venues.regionId, region.id) : undefined,
      located === 'yes'
        ? isNotNull(venues.location)
        : located === 'no'
          ? isNull(venues.location)
          : undefined,
    ] satisfies (SQL | undefined)[]),
  );

  const [rows, totals, missing] = await Promise.all([
    db()
      .select({
        id: venues.id,
        name: venues.name,
        address: venues.address,
        regionName: regions.name,
        location: venues.location,
      })
      .from(venues)
      .innerJoin(regions, eq(venues.regionId, regions.id))
      .where(where)
      .orderBy(asc(venues.name))
      .limit(pageSize)
      .offset(offset),
    db().select({ total: count() }).from(venues).where(where),
    db().select({ total: count() }).from(venues).where(isNull(venues.location)),
  ]);
  const total = totals[0]?.total ?? 0;
  const missingCount = missing[0]?.total ?? 0;
  const filtered = Boolean(q || region || located);

  return (
    <>
      <PageHeader
        title="Venues"
        description="Where productions play. Each venue is located on the map once, from its address."
        actions={
          <Link href="/admin/venues/new" className="button primary">
            New venue
          </Link>
        }
      />
      {saved && (
        <p role="status" className={geo ? 'error notice' : 'success notice'}>
          Saved <code>{saved}</code>
          {geo && GEO_MESSAGES[geo] ? `, ${GEO_MESSAGES[geo]}` : '.'}
        </p>
      )}
      {missingCount > 0 && located !== 'no' && (
        <p className="notice">
          <span className="badge accent">{missingCount} missing</span>{' '}
          <Link href="/admin/venues?located=no">
            {missingCount === 1 ? 'One venue has' : `${missingCount} venues have`} no map location
          </Link>
          , so {missingCount === 1 ? 'it won’t' : 'they won’t'} show up in distance searches.
        </p>
      )}
      <ListToolbar
        q={q}
        placeholder="Search name or address"
        filters={
          <>
            <FilterSelect
              name="region"
              label="Region"
              value={region?.id}
              options={allRegions.map((r) => ({ value: r.id, label: r.name }))}
            />
            <FilterSelect
              name="located"
              label="Map location"
              value={located}
              options={[
                { value: 'yes', label: 'Found' },
                { value: 'no', label: 'Missing' },
              ]}
            />
          </>
        }
      >
        {filtered && <Link href="/admin/venues">Clear filters</Link>}
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={filtered ? 'No venues match these filters.' : 'No venues yet. Add the first one.'}
      />
      <Pagination
        pathname="/admin/venues"
        searchParams={sp}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
