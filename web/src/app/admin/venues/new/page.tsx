import type { Metadata } from 'next';
import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { regions } from '@curtainly/shared/db/schema';
import { OSM_ATTRIBUTION } from '@curtainly/shared/geocode';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '../../_components/page-header';
import { createVenue } from '../actions';
import { VenueForm } from '../venue-form';

export const metadata: Metadata = { title: 'New venue' };

export default async function NewVenuePage() {
  await requireAdmin();
  const allRegions = await db()
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.name));

  if (allRegions.length === 0) {
    return (
      <>
        <PageHeader title="New venue" />
        <p className="empty">
          Every venue belongs to a region. <Link href="/admin/regions/new">Create a region</Link>{' '}
          first.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New venue" />
      <VenueForm
        action={createVenue}
        isNew
        regions={allRegions}
        attribution={OSM_ATTRIBUTION}
        defaults={{
          name: '',
          slug: '',
          address: '',
          regionId: allRegions[0]!.id,
          website: '',
          lat: '',
          lng: '',
        }}
      />
    </>
  );
}
