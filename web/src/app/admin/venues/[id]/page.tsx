import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { companies, productions, regions, venues } from '@curtainly/shared/db/schema';
import { OSM_ATTRIBUTION } from '@curtainly/shared/geocode';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { osmMapUrl } from '@/lib/geo';
import { DataTable, type Column } from '../../_components/data-table';
import { PageHeader } from '../../_components/page-header';
import { updateVenue } from '../actions';
import { VenueForm } from '../venue-form';

type Props = { params: Promise<{ id: string }> };

async function loadVenue(id: string) {
  if (!isUuid(id)) return undefined;
  const [venue] = await db().select().from(venues).where(eq(venues.id, id)).limit(1);
  return venue;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const venue = await loadVenue((await params).id);
  return { title: venue ? `Edit ${venue.name}` : 'Venue not found' };
}

type CompanyRow = { id: string; name: string };
const companyColumns: Column<CompanyRow>[] = [
  {
    key: 'name',
    header: 'Company',
    cell: (c) => <Link href={`/admin/companies/${c.id}`}>{c.name}</Link>,
  },
];

export default async function EditVenuePage({ params }: Props) {
  await requireAdmin();
  const venue = await loadVenue((await params).id);
  if (!venue) notFound();

  const [allRegions, venueCompanies] = await Promise.all([
    db().select({ id: regions.id, name: regions.name }).from(regions).orderBy(asc(regions.name)),
    db()
      .selectDistinct({ id: companies.id, name: companies.name })
      .from(productions)
      .innerJoin(companies, eq(productions.companyId, companies.id))
      .where(eq(productions.venueId, venue.id))
      .orderBy(asc(companies.name)),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${venue.name}`}
        description={
          venue.location
            ? undefined
            : 'No map location yet: this venue won’t show up in distance searches.'
        }
        actions={
          venue.location ? (
            <a
              className="button"
              href={osmMapUrl(venue.location.y, venue.location.x)}
              target="_blank"
              rel="noreferrer"
            >
              View on map
            </a>
          ) : undefined
        }
      />
      <VenueForm
        action={updateVenue.bind(null, venue.id)}
        isNew={false}
        regions={allRegions}
        attribution={OSM_ATTRIBUTION}
        defaults={{
          name: venue.name,
          slug: venue.slug,
          address: venue.address,
          regionId: venue.regionId,
          website: venue.website ?? '',
          lat: venue.location ? String(venue.location.y) : '',
          lng: venue.location ? String(venue.location.x) : '',
        }}
      />

      <section className="related">
        <h2>Companies</h2>
        <p className="muted">Companies whose productions play here.</p>
        <DataTable
          columns={companyColumns}
          rows={venueCompanies}
          rowKey={(c) => c.id}
          empty="No productions here yet."
        />
      </section>
    </>
  );
}
