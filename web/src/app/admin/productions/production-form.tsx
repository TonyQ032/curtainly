'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from '@curtainly/shared';
import { Field, FormMessage, SubmitButton } from '../_components/form';
import type { ProductionFormState } from './form-state';
import { PerformanceEditor } from './performance-editor';
import { WorkPicker } from './work-picker';

export type ProductionFormValues = {
  workId: string;
  /** JSON {id, title, type} of the picked work, so the picker can show it. */
  workLabel: string;
  newWorkTitle: string;
  newWorkType: string;
  companyId: string;
  venueId: string;
  slug: string;
  startDate: string;
  endDate: string;
  priceMin: string;
  priceMax: string;
  ticketUrl: string;
  advisory: string;
  runtimeMin: string;
  familyFriendly: string;
  status: string;
  /** JSON array of PerformanceRow. */
  performances: string;
  /** Set when editing a review item before approving it ("edit then approve"). */
  reviewItemId?: string;
};

export type CompanyOption = {
  id: string;
  name: string;
  regionName: string;
  inScope: boolean;
  active: boolean;
};
export type VenueOption = { id: string; name: string; regionName: string; timezone: string };

const STATUS_HINTS: Record<ProductionStatus, string> = {
  draft: 'Not listed yet.',
  published: 'Listed on the site. Needs performances and an in-scope company.',
  cancelled: 'Listed as cancelled, so people who saw it know.',
  archived: 'Closed. Set automatically after the last date.',
};

/** <optgroup>s by region, in the order given. */
function byRegion<T extends { regionName: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.regionName) ?? [];
    list.push(item);
    groups.set(item.regionName, list);
  }
  return [...groups];
}

const initialState: ProductionFormState = { status: 'idle' };

export function ProductionForm({
  action,
  defaults,
  companies,
  venues,
  isNew,
}: {
  action: (state: ProductionFormState, formData: FormData) => Promise<ProductionFormState>;
  defaults: ProductionFormValues;
  companies: CompanyOption[];
  venues: VenueOption[];
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <ProductionFormFields
      // Re-mount after a failed save so every field shows what was submitted.
      key={JSON.stringify(state.values ?? defaults)}
      state={state}
      formAction={formAction}
      defaults={defaults}
      companies={companies}
      venues={venues}
      isNew={isNew}
    />
  );
}

function ProductionFormFields({
  state,
  formAction,
  defaults,
  companies,
  venues,
  isNew,
}: {
  state: ProductionFormState;
  formAction: (formData: FormData) => void;
  defaults: ProductionFormValues;
  companies: CompanyOption[];
  venues: VenueOption[];
  isNew: boolean;
}) {
  const echoed = state.values;
  const v = (name: Exclude<keyof ProductionFormValues, 'reviewItemId'>) =>
    echoed?.[name] ?? defaults[name];
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');

  // Tracked so the performance editor knows the timezone and the run's dates.
  const [venueId, setVenueId] = useState(v('venueId'));
  const [startDate, setStartDate] = useState(v('startDate'));
  const [endDate, setEndDate] = useState(v('endDate'));
  const timezone = venues.find((x) => x.id === venueId)?.timezone;

  const status = v('status');
  const statuses: ProductionStatus[] =
    defaults.status === 'archived'
      ? ['draft', 'published', 'cancelled', 'archived']
      : ['draft', 'published', 'cancelled'];
  // An unchecked box posts nothing, so after an error only the echo counts.
  const familyFriendly = echoed ? echoed.familyFriendly === 'on' : defaults.familyFriendly === 'on';

  return (
    <form action={formAction} className="stack form production-form">
      <FormMessage state={state} />
      {defaults.reviewItemId && (
        <>
          <input type="hidden" name="reviewItemId" value={defaults.reviewItemId} />
          <p className="callout">
            Filled in from a{' '}
            <Link href={`/admin/review/${defaults.reviewItemId}`}>review item</Link>. Saving
            approves it.
          </p>
        </>
      )}
      {state.overlapping && (
        <p className="callout">
          Existing production:{' '}
          <Link href={`/admin/productions/${state.overlapping.id}`}>{state.overlapping.label}</Link>
        </p>
      )}

      <WorkPicker
        defaults={{
          workId: v('workId'),
          workLabel: v('workLabel'),
          newWorkTitle: v('newWorkTitle'),
          newWorkType: v('newWorkType'),
        }}
        error={err('workId')}
        matches={state.workMatches}
        newWorkKey={state.newWorkKey}
      />

      <label className="field">
        <span>Company</span>
        <select
          name="companyId"
          defaultValue={v('companyId')}
          required
          aria-invalid={err('companyId') ? true : undefined}
        >
          <option value="" disabled>
            Pick a company
          </option>
          {byRegion(companies).map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.inScope ? ' (out of scope)' : !c.active ? ' (inactive)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {err('companyId') && <small className="error">{err('companyId')}</small>}
      </label>

      <label className="field">
        <span>Venue</span>
        <select
          name="venueId"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          required
          aria-invalid={err('venueId') ? true : undefined}
        >
          <option value="" disabled>
            Pick a venue
          </option>
          {byRegion(venues).map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {err('venueId') ? (
          <small className="error">{err('venueId')}</small>
        ) : (
          <small className="muted">
            Where most performances play. A performance can override it below.
          </small>
        )}
      </label>

      <div className="field-row">
        <Field
          label="First date"
          name="startDate"
          state={state}
          defaultValue={startDate}
          type="date"
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Field
          label="Last date"
          name="endDate"
          state={state}
          defaultValue={endDate}
          type="date"
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <small className="muted field-note">Leave blank to use the first and last performance.</small>

      <PerformanceEditor
        name="performances"
        defaultValue={v('performances')}
        venues={venues}
        timezone={timezone}
        runStart={startDate}
        runEnd={endDate}
        error={err('performances')}
      />

      <div className="field-row">
        <Field
          label="Lowest price ($)"
          name="priceMin"
          state={state}
          defaultValue={v('priceMin')}
          inputMode="decimal"
        />
        <Field
          label="Highest price ($)"
          name="priceMax"
          state={state}
          defaultValue={v('priceMax')}
          inputMode="decimal"
        />
      </div>
      <Field
        label="Ticket link"
        name="ticketUrl"
        state={state}
        defaultValue={v('ticketUrl')}
        inputMode="url"
        hint="The official ticketing page. https:// is added if you leave it off."
      />
      <Field
        label="Content advisory"
        name="advisory"
        state={state}
        defaultValue={v('advisory')}
        maxLength={500}
        hint="Only what the company states, e.g. “Strong language; haze and strobe effects.”"
      />
      <Field
        label="Runtime (minutes)"
        name="runtimeMin"
        state={state}
        defaultValue={v('runtimeMin')}
        inputMode="numeric"
        hint="Including intermission, when known."
      />
      <label className="radio">
        <input type="checkbox" name="familyFriendly" defaultChecked={familyFriendly} />
        <span>Family friendly</span>
      </label>

      <fieldset className="fieldset">
        <legend>Status</legend>
        {statuses.map((s) => (
          <label key={s} className="radio">
            <input type="radio" name="status" value={s} defaultChecked={status === s} required />
            <span>
              {PRODUCTION_STATUS_LABELS[s]} <small className="muted">{STATUS_HINTS[s]}</small>
            </span>
          </label>
        ))}
        {err('status') && <small className="error">{err('status')}</small>}
      </fieldset>

      <Field
        label="Slug"
        name="slug"
        state={state}
        defaultValue={v('slug')}
        placeholder={isNew ? 'Generated: work-company-year' : undefined}
        hint={
          isNew
            ? 'Used in URLs. Leave blank to generate it.'
            : 'Changing it changes public URLs. Clear it to regenerate.'
        }
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />

      <div className="form-actions">
        <SubmitButton pendingText={isNew ? 'Creating…' : 'Saving…'}>
          {defaults.reviewItemId
            ? 'Save and approve'
            : isNew
              ? 'Create production'
              : 'Save changes'}
        </SubmitButton>
        <Link
          href={
            defaults.reviewItemId ? `/admin/review/${defaults.reviewItemId}` : '/admin/productions'
          }
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
