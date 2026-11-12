import type { Metadata } from 'next';
import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { regions } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '../../_components/page-header';
import { createCompany } from '../actions';
import { CompanyForm } from '../company-form';

export const metadata: Metadata = { title: 'New company' };

export default async function NewCompanyPage() {
  await requireAdmin();
  const allRegions = await db()
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .orderBy(asc(regions.name));

  if (allRegions.length === 0) {
    return (
      <>
        <PageHeader title="New company" />
        <p className="empty">
          Every company belongs to a region. <Link href="/admin/regions/new">Create a region</Link>{' '}
          first.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New company" />
      <CompanyForm
        action={createCompany}
        isNew
        regions={allRegions}
        defaults={{
          name: '',
          slug: '',
          tier: 'community',
          regionId: allRegions[0]!.id,
          website: '',
          inScope: true,
          active: true,
          notes: '',
        }}
      />
    </>
  );
}
