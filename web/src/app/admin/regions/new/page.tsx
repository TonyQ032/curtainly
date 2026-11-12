import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '../../_components/page-header';
import { createRegion } from '../actions';
import { RegionForm } from '../region-form';
import { timeZoneOptions } from '../timezones';

export const metadata: Metadata = { title: 'New region' };

export default async function NewRegionPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New region" />
      <RegionForm
        action={createRegion}
        isNew
        timeZones={timeZoneOptions()}
        defaults={{
          name: '',
          slug: '',
          timezone: 'America/Los_Angeles',
          lat: '',
          lng: '',
          radiusMiles: '25',
          status: 'planned',
        }}
      />
    </>
  );
}
