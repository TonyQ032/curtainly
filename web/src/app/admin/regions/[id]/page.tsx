import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { regions } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '../../_components/page-header';
import { updateRegion } from '../actions';
import { RegionForm } from '../region-form';
import { timeZoneOptions } from '../timezones';

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadRegion(id: string) {
  if (!UUID.test(id)) return undefined;
  const [region] = await db().select().from(regions).where(eq(regions.id, id)).limit(1);
  return region;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const region = await loadRegion((await params).id);
  return { title: region ? `Edit ${region.name}` : 'Region not found' };
}

export default async function EditRegionPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const region = await loadRegion(id);
  if (!region) notFound();

  return (
    <>
      <PageHeader title={`Edit ${region.name}`} />
      <RegionForm
        action={updateRegion.bind(null, region.id)}
        isNew={false}
        timeZones={timeZoneOptions(region.timezone)}
        defaults={{
          name: region.name,
          slug: region.slug,
          timezone: region.timezone,
          lat: String(region.center.y),
          lng: String(region.center.x),
          radiusMiles: String(region.radiusMiles),
          status: region.status,
        }}
      />
    </>
  );
}
