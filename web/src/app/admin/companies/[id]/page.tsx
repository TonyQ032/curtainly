import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { companies, productions, regions, sources, venues } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { DataTable, type Column } from '../../_components/data-table';
import { PageHeader } from '../../_components/page-header';
import { updateCompany } from '../actions';
import { CompanyForm } from '../company-form';

type Props = { params: Promise<{ id: string }> };

async function loadCompany(id: string) {
  if (!isUuid(id)) return undefined;
  const [company] = await db().select().from(companies).where(eq(companies.id, id)).limit(1);
  return company;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const company = await loadCompany((await params).id);
  return { title: company ? `Edit ${company.name}` : 'Company not found' };
}

type SourceRow = typeof sources.$inferSelect;
const sourceColumns: Column<SourceRow>[] = [
  { key: 'kind', header: 'Kind', cell: (s) => <code>{s.kind}</code> },
  {
    key: 'enabled',
    header: 'Enabled',
    cell: (s) => (s.enabled ? 'Yes' : <span className="muted">No</span>),
  },
  { key: 'health', header: 'Health', cell: (s) => <span className="badge">{s.health}</span> },
  {
    key: 'lastRun',
    header: 'Last run',
    cell: (s) =>
      s.lastRunAt ? (
        s.lastRunAt.toISOString().slice(0, 16).replace('T', ' ')
      ) : (
        <span className="muted">Never</span>
      ),
  },
  { key: 'items', header: 'Items', cell: (s) => s.lastItemCount ?? '–', numeric: true },
];

type VenueRow = { id: string; name: string; address: string };
const venueColumns: Column<VenueRow>[] = [
  { key: 'name', header: 'Venue', cell: (v) => v.name },
  { key: 'address', header: 'Address', cell: (v) => v.address },
];

export default async function EditCompanyPage({ params }: Props) {
  await requireAdmin();
  const company = await loadCompany((await params).id);
  if (!company) notFound();

  const [allRegions, companySources, companyVenues] = await Promise.all([
    db().select({ id: regions.id, name: regions.name }).from(regions).orderBy(asc(regions.name)),
    db().select().from(sources).where(eq(sources.companyId, company.id)).orderBy(asc(sources.kind)),
    // A company has no fixed venues: these are the venues its productions use.
    db()
      .selectDistinct({ id: venues.id, name: venues.name, address: venues.address })
      .from(productions)
      .innerJoin(venues, eq(productions.venueId, venues.id))
      .where(eq(productions.companyId, company.id))
      .orderBy(asc(venues.name)),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${company.name}`} />
      <CompanyForm
        action={updateCompany.bind(null, company.id)}
        isNew={false}
        regions={allRegions}
        defaults={{
          name: company.name,
          slug: company.slug,
          tier: company.tier,
          regionId: company.regionId,
          website: company.website ?? '',
          inScope: company.inScope,
          active: company.active,
          notes: company.notes ?? '',
        }}
      />

      <section className="related">
        <h2>Sources</h2>
        <p className="muted">
          How listings for this company reach Curtainly. Managed in Sources (#14).
        </p>
        <DataTable
          columns={sourceColumns}
          rows={companySources}
          rowKey={(s) => s.id}
          empty="No sources yet."
        />
      </section>

      <section className="related">
        <h2>Venues</h2>
        <p className="muted">Venues used by this company&rsquo;s productions.</p>
        <DataTable
          columns={venueColumns}
          rows={companyVenues}
          rowKey={(v) => v.id}
          empty={
            <>
              No productions yet, so no venues. Venues are managed in{' '}
              <Link href="/admin/venues">Venues</Link>.
            </>
          }
        />
      </section>
    </>
  );
}
