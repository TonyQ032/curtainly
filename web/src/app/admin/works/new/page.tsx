import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '../../_components/page-header';
import { createWork } from '../actions';
import { WorkForm } from '../work-form';

export const metadata: Metadata = { title: 'New work' };

export default async function NewWorkPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New work" />
      <WorkForm
        action={createWork}
        isNew
        defaults={{ title: '', slug: '', type: 'musical', altTitles: '', authors: '[]' }}
      />
    </>
  );
}
