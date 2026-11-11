import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { PLACEHOLDERS } from '../_components/nav-items';
import { PageHeader } from '../_components/page-header';

/**
 * Placeholder for admin sections that aren't built yet. A real page at
 * app/admin/<section>/page.tsx takes precedence over this route.
 */
type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = PLACEHOLDERS.get((await params).section);
  return { title: item?.label };
}

export default async function PlaceholderSection({ params }: Props) {
  await requireAdmin();
  const item = PLACEHOLDERS.get((await params).section);
  if (!item) notFound();

  return (
    <>
      <PageHeader title={item.label} />
      <p className="empty">
        Not built yet. Tracked in{' '}
        <a href={`https://github.com/TonyQ032/curtainly/issues/${item.issue}`}>#{item.issue}</a>.
      </p>
    </>
  );
}
