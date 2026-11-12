import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { companies, sources } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import { PageHeader } from '../../_components/page-header';
import { updateSource } from '../actions';
import { SOURCE_KIND_LABELS } from '../config';
import { formatWhen, HealthBadge } from '../health';
import { SourceForm } from '../source-form';

type Props = { params: Promise<{ id: string }> };

async function loadSource(id: string) {
  if (!isUuid(id)) return undefined;
  const [row] = await db()
    .select({ source: sources, companyName: companies.name })
    .from(sources)
    .innerJoin(companies, eq(sources.companyId, companies.id))
    .where(eq(sources.id, id))
    .limit(1);
  return row;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const row = await loadSource((await params).id);
  return { title: row ? `Edit ${SOURCE_KIND_LABELS[row.source.kind]} source` : 'Source not found' };
}

export default async function EditSourcePage({ params }: Props) {
  await requireAdmin();
  const row = await loadSource((await params).id);
  if (!row) notFound();
  const { source, companyName } = row;
  const allCompanies = await db()
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  const never = <span className="muted">Never</span>;
  return (
    <>
      <PageHeader title={`${SOURCE_KIND_LABELS[source.kind]} · ${companyName}`} />

      <section className="related">
        <h2>Health</h2>
        <p className="muted">Recorded by the ingest runner. Read-only.</p>
        <dl className="details">
          <dt>Health</dt>
          <dd>
            <HealthBadge health={source.health} />
          </dd>
          <dt>Last run</dt>
          <dd>{formatWhen(source.lastRunAt) ?? never}</dd>
          <dt>Last success</dt>
          <dd>{formatWhen(source.lastSuccessAt) ?? never}</dd>
          <dt>Items on last run</dt>
          <dd>{source.lastItemCount ?? <span className="muted">–</span>}</dd>
          <dt>Last error</dt>
          <dd>
            {source.lastError ? (
              <code>{source.lastError}</code>
            ) : (
              <span className="muted">None</span>
            )}
          </dd>
        </dl>
      </section>

      <SourceForm
        action={updateSource.bind(null, source.id)}
        isNew={false}
        companies={allCompanies}
        defaults={{
          companyId: source.companyId,
          kind: source.kind,
          config: JSON.stringify(source.config, null, 2),
          enabled: source.enabled,
          autoApprove: source.autoApprove,
        }}
      />
    </>
  );
}
