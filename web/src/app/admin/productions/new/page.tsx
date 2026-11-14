import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { works } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import type { SearchParams } from '@/lib/list-params';
import { PageHeader } from '../../_components/page-header';
import { loadReviewItem, newProductionPrefill } from '../../review/review-data';
import { createProduction } from '../actions';
import { loadFormOptions } from '../options';
import { ProductionForm } from '../production-form';

export const metadata: Metadata = { title: 'New production' };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * `?work=<id>` and `?company=<id>` prefill the form (links from Work and Company
 * pages); `?review=<id>` fills it from a new review item ("edit then approve").
 */
export default async function NewProductionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const workParam = one(sp.work) ?? '';
  const companyParam = one(sp.company) ?? '';
  const reviewParam = one(sp.review) ?? '';

  const [options, [work], review] = await Promise.all([
    loadFormOptions(),
    isUuid(workParam)
      ? db()
          .select({ id: works.id, title: works.title, type: works.type })
          .from(works)
          .where(eq(works.id, workParam))
          .limit(1)
      : Promise.resolve([]),
    reviewParam
      ? loadReviewItem(reviewParam).then((row) => (row ? newProductionPrefill(row) : undefined))
      : Promise.resolve(undefined),
  ]);

  if (options.companies.length === 0 || options.venues.length === 0) {
    return (
      <>
        <PageHeader title="New production" />
        <p className="empty">
          A production needs a company and a venue.{' '}
          {options.companies.length === 0 ? (
            <Link href="/admin/companies/new">Create a company</Link>
          ) : (
            <Link href="/admin/venues/new">Create a venue</Link>
          )}{' '}
          first.
        </p>
      </>
    );
  }

  const company = options.companies.find((c) => c.id === companyParam);

  return (
    <>
      <PageHeader
        title="New production"
        description={
          review
            ? 'Check the source’s values, fix what’s wrong, and save to approve.'
            : "For companies with no automatable source. One company's run of one work."
        }
      />
      {reviewParam && !review && (
        <p className="callout">
          That review item isn’t pending any more, or isn’t a new production.{' '}
          <Link href="/admin/review">Back to the queue</Link>
        </p>
      )}
      <ProductionForm
        action={createProduction}
        isNew
        companies={options.companies}
        venues={options.venues}
        defaults={{
          workId: work?.id ?? '',
          workLabel: work ? JSON.stringify(work) : '',
          newWorkTitle: '',
          newWorkType: '',
          companyId: company?.id ?? '',
          venueId: '',
          slug: '',
          startDate: '',
          endDate: '',
          priceMin: '',
          priceMax: '',
          ticketUrl: '',
          advisory: '',
          runtimeMin: '',
          familyFriendly: '',
          status: 'draft',
          performances: '[]',
          ...review,
        }}
      />
    </>
  );
}
