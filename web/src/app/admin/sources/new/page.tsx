import type { Metadata } from 'next';
import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { companies } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { PageHeader } from '../../_components/page-header';
import { createSource } from '../actions';
import { SourceForm } from '../source-form';

export const metadata: Metadata = { title: 'New source' };

export default async function NewSourcePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireAdmin();
  const { company } = await searchParams;
  const all = await db()
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  if (all.length === 0) {
    return (
      <>
        <PageHeader title="New source" />
        <p className="empty">
          Every source belongs to a company. <Link href="/admin/companies/new">Add a company</Link>{' '}
          first.
        </p>
      </>
    );
  }

  const preset = company && isUuid(company) ? all.find((c) => c.id === company) : undefined;
  return (
    <>
      <PageHeader title="New source" />
      <SourceForm
        action={createSource}
        isNew
        companies={all}
        defaults={{
          companyId: preset?.id ?? all[0]!.id,
          kind: 'jsonld',
          config: '',
          enabled: true,
          autoApprove: false,
        }}
      />
    </>
  );
}
