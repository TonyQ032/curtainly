import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import {
  PRODUCTION_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  utcToZoned,
  type ProductionDiff,
} from '@curtainly/shared';
import { productions, venues, works } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { formatDate, formatDateRange, formatTime } from '@/lib/dates';
import { db } from '@/lib/db';
import { PageHeader } from '../../_components/page-header';
import { SOURCE_KIND_LABELS } from '../../sources/config';
import { formatWhen } from '../../sources/health';
import { loadReviewItem, workSuggestions, type LoadedReviewItem } from '../review-data';
import {
  matchKindLabel,
  matchVenue,
  preselectedWork,
  priceText,
  proposedInstants,
  type Proposed,
} from '../review-item';
import { ReviewActions } from './review-actions-panel';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const row = await loadReviewItem((await params).id);
  return { title: row ? `Review ${row.proposed?.title ?? 'item'}` : 'Review item not found' };
}

const DIFF_FIELD_LABELS: Record<ProductionDiff['fields'][number]['field'], string> = {
  priceMin: 'Lowest price',
  priceMax: 'Highest price',
  ticketUrl: 'Ticket link',
  advisory: 'Advisory',
  runtimeMin: 'Runtime (min)',
};

const none = <span className="muted">–</span>;

function when(instant: string | Date, timeZone: string) {
  const local = utcToZoned(new Date(instant), timeZone);
  return `${formatDate(local.date)}, ${formatTime(local.time)}`;
}

function price(min?: number, max?: number) {
  if (min === undefined && max === undefined) return none;
  if (min === undefined || max === undefined || min === max) {
    return `$${priceText(min ?? max)}`;
  }
  return `$${priceText(min)}–$${priceText(max)}`;
}

function ProposedFacts({ proposed, timeZone }: { proposed: Proposed; timeZone: string }) {
  const instants = proposedInstants(proposed);
  return (
    <dl className="details">
      <dt>Title</dt>
      <dd>{proposed.title}</dd>
      <dt>Venue</dt>
      <dd>
        {proposed.venueName ?? none}
        {proposed.venueAddress && <div className="muted">{proposed.venueAddress}</div>}
      </dd>
      <dt>Performances</dt>
      <dd>
        {instants.length === 0 ? (
          none
        ) : (
          <details>
            <summary>
              {instants.length} ·{' '}
              {formatDateRange(
                utcToZoned(instants[0]!, timeZone).date,
                utcToZoned(instants.at(-1)!, timeZone).date,
              )}
            </summary>
            <ul className="plain-list">
              {instants.map((d) => (
                <li key={d.toISOString()}>{when(d, timeZone)}</li>
              ))}
            </ul>
          </details>
        )}
      </dd>
      <dt>Price</dt>
      <dd>{price(proposed.priceMin, proposed.priceMax)}</dd>
      <dt>Ticket link</dt>
      <dd>
        {proposed.ticketUrl ? (
          <a href={proposed.ticketUrl} target="_blank" rel="noreferrer noopener">
            {proposed.ticketUrl}
          </a>
        ) : (
          none
        )}
      </dd>
      <dt>Advisory</dt>
      <dd>{proposed.advisory ?? none}</dd>
      <dt>Runtime</dt>
      <dd>{proposed.runtimeMin ? `${proposed.runtimeMin} min` : none}</dd>
    </dl>
  );
}

function DiffView({ diff, timeZone }: { diff: ProductionDiff; timeZone: string }) {
  const { added, removed } = diff.performances;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Change</th>
            <th scope="col">Now</th>
            <th scope="col">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {diff.dates && (
            <tr>
              <td>Dates</td>
              <td>{formatDateRange(diff.dates.from.startDate, diff.dates.from.endDate)}</td>
              <td>{formatDateRange(diff.dates.to.startDate, diff.dates.to.endDate)}</td>
            </tr>
          )}
          {diff.fields.map((f) => (
            <tr key={f.field}>
              <td>{DIFF_FIELD_LABELS[f.field]}</td>
              <td>{f.from ?? none}</td>
              <td>{f.to}</td>
            </tr>
          ))}
          {added.map((t) => (
            <tr key={`a${t}`}>
              <td>Add performance</td>
              <td>{none}</td>
              <td>{when(t, timeZone)}</td>
            </tr>
          ))}
          {removed.map((t) => (
            <tr key={`r${t}`}>
              <td>Remove performance</td>
              <td>
                <del>{when(t, timeZone)}</del>
              </td>
              <td>{none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadContext(row: LoadedReviewItem) {
  const { item, company } = row;
  const [current] = item.productionId
    ? await db()
        .select({
          id: productions.id,
          workTitle: works.title,
          startDate: productions.startDate,
          endDate: productions.endDate,
          status: productions.status,
        })
        .from(productions)
        .innerJoin(works, eq(productions.workId, works.id))
        .where(eq(productions.id, item.productionId))
        .limit(1)
    : [];
  if (item.status !== 'pending' || item.productionId || !company) {
    return { current, companyProductions: [], venueOptions: [] };
  }

  const [companyProductions, venueRows] = await Promise.all([
    db()
      .select({
        id: productions.id,
        workTitle: works.title,
        venueId: productions.venueId,
        startDate: productions.startDate,
        endDate: productions.endDate,
        status: productions.status,
      })
      .from(productions)
      .innerJoin(works, eq(productions.workId, works.id))
      .where(eq(productions.companyId, company.id))
      .orderBy(desc(productions.startDate))
      .limit(100),
    db()
      .select({ id: venues.id, name: venues.name, regionId: venues.regionId })
      .from(venues)
      .orderBy(venues.name),
  ]);
  return { current, companyProductions, venueOptions: venueRows };
}

export default async function ReviewItemPage({ params }: Props) {
  await requireAdmin();
  const row = await loadReviewItem((await params).id);
  if (!row) notFound();
  const { item, source, proposed, company } = row;
  const [{ current, companyProductions, venueOptions }, suggestions] = await Promise.all([
    loadContext(row),
    workSuggestions(row),
  ]);
  const timeZone = company?.timezone ?? 'America/Los_Angeles';
  const isUpdate = !!item.productionId;
  const pending = item.status === 'pending';

  const sourceLabel = source ? SOURCE_KIND_LABELS[source.kind] : 'No source';
  const title = proposed?.title ?? 'Review item';

  return (
    <>
      <PageHeader
        title={title}
        description={[company?.name ?? 'Unknown company', sourceLabel].join(' · ')}
        actions={<Link href="/admin/review">Back to queue</Link>}
      />

      <dl className="details review-meta">
        <dt>Type</dt>
        <dd>
          <span className="badge accent">{isUpdate ? 'Update' : 'New production'}</span>
        </dd>
        <dt>Status</dt>
        <dd>
          <span className="badge">{REVIEW_STATUS_LABELS[item.status]}</span>
        </dd>
        <dt>Queued</dt>
        <dd>
          {formatWhen(item.createdAt)}
          {pending && item.updatedAt.getTime() !== item.createdAt.getTime() && (
            <span className="muted"> · changed {formatWhen(item.updatedAt)}</span>
          )}
        </dd>
        {!pending && (
          <>
            <dt>Reviewed</dt>
            <dd>
              {item.reviewer ?? 'Unknown'}, {formatWhen(item.reviewedAt)}
            </dd>
          </>
        )}
        {item.rejectReason && (
          <>
            <dt>Reason</dt>
            <dd>{item.rejectReason}</dd>
          </>
        )}
        {current && (
          <>
            <dt>Production</dt>
            <dd>
              <Link href={`/admin/productions/${current.id}`}>{current.workTitle}</Link>,{' '}
              {formatDateRange(current.startDate, current.endDate)} (
              {PRODUCTION_STATUS_LABELS[current.status]})
            </dd>
          </>
        )}
        {company && !company.inScope && (
          <>
            <dt>Scope</dt>
            <dd className="error">{company.name} is out of scope; it can’t be published.</dd>
          </>
        )}
      </dl>

      {isUpdate && item.diff && (
        <section className="related">
          <h2>Changes</h2>
          <p className="muted">
            What re-ingesting would change. Times in {timeZone.replace('_', ' ')}.
          </p>
          <DiffView diff={item.diff} timeZone={timeZone} />
        </section>
      )}

      <div className="review-columns">
        <section>
          <h2>Proposed</h2>
          {proposed ? (
            <ProposedFacts proposed={proposed} timeZone={timeZone} />
          ) : (
            <p className="muted">Not a production the queue can read. See the raw payload.</p>
          )}
        </section>
        <section>
          <h2>Raw payload</h2>
          <RawPayload payload={item.payload} />
        </section>
      </div>

      {!isUpdate && (
        <section className="related">
          <h2>Work matches</h2>
          {suggestions.length === 0 ? (
            <p className="muted">No existing work looks like this title.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Work</th>
                    <th scope="col">Match</th>
                    <th scope="col" className="num">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((m) => (
                    <tr key={m.workId}>
                      <td>
                        <Link href={`/admin/works/${m.workId}`}>{m.title}</Link>
                        {m.matchedTitle !== m.title && (
                          <span className="muted"> (as “{m.matchedTitle}”)</span>
                        )}
                      </td>
                      <td>{matchKindLabel(m.kind)}</td>
                      <td className="num">{Math.round(m.score * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {pending && (
        <ReviewActions
          id={item.id}
          kind={isUpdate ? 'update' : 'new'}
          editHref={
            isUpdate
              ? `/admin/productions/${item.productionId}?review=${item.id}`
              : `/admin/productions/new?review=${item.id}`
          }
          canApprove={isUpdate ? !!item.diff : !!proposed && !!company}
          canMarkNotAShow={!!item.sourceId && !!item.candidateKey}
          proposedTitle={proposed?.title ?? ''}
          suggestions={suggestions}
          preselectedWorkId={preselectedWork(suggestions)?.workId ?? ''}
          venues={venueOptions.map((v) => ({ id: v.id, name: v.name }))}
          venueId={
            matchVenue(proposed?.venueName, venueOptions, {
              regionId: company?.regionId,
              usualVenueId: companyProductions[0]?.venueId,
            }) ?? ''
          }
          inScope={company?.inScope ?? false}
          productions={companyProductions.map((p) => ({
            id: p.id,
            label: `${p.workTitle}, ${formatDateRange(p.startDate, p.endDate)} (${PRODUCTION_STATUS_LABELS[p.status]})`,
          }))}
        />
      )}
    </>
  );
}

/** Each raw item as fetched, with its link. Shown as data, never as copy. */
function RawPayload({ payload }: { payload: unknown }) {
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) return <p className="muted">No raw items were stored.</p>;
  return (
    <div className="stack">
      {items.map((raw, i) => {
        const r = raw as { url?: unknown; externalId?: unknown; data?: unknown } | null;
        const url = typeof r?.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : undefined;
        return (
          <div key={i} className="raw-item">
            {(url || r?.externalId != null) && (
              <p className="muted">
                {r?.externalId != null && <>ID {String(r.externalId)} · </>}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer noopener">
                    Open source page
                  </a>
                )}
              </p>
            )}
            <pre className="raw-json">{JSON.stringify(r?.data ?? raw, null, 2)}</pre>
          </div>
        );
      })}
    </div>
  );
}
