'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { TIERS, TIER_LABELS } from '@curtainly/shared';
import { initialFormState, type FormState } from '@/lib/forms';
import { Field, FormMessage, SubmitButton } from '../_components/form';

export type CompanyFormValues = {
  name: string;
  slug: string;
  tier: string;
  regionId: string;
  website: string;
  inScope: boolean;
  active: boolean;
  notes: string;
};

const TIER_HINTS: Record<string, string> = {
  professional: 'Equity houses, regional theatres, touring venues',
  indie_fringe: 'Independent companies with regular seasons',
  community: 'Volunteer and community theatres',
  college: 'College and university theatre departments',
};

export function CompanyForm({
  action,
  defaults,
  regions,
  isNew,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: CompanyFormValues;
  regions: { id: string; name: string }[];
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  // After a failed submit, show what was typed. Unchecked boxes aren't submitted at all.
  const sent = state.values;
  const text = (name: Exclude<keyof CompanyFormValues, 'inScope' | 'active'>) =>
    sent?.[name] ?? defaults[name];
  const checked = (name: 'inScope' | 'active') => (sent ? sent[name] === 'on' : defaults[name]);
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');

  return (
    <form action={formAction} className="stack form" key={JSON.stringify(sent ?? defaults)}>
      <FormMessage state={state} />

      <Field
        label="Name"
        name="name"
        state={state}
        defaultValue={text('name')}
        required
        maxLength={160}
      />
      <Field
        label="Slug"
        name="slug"
        state={state}
        defaultValue={text('slug')}
        placeholder={isNew ? 'Generated from the name' : undefined}
        hint={
          isNew ? 'Used in URLs. Leave blank to generate it.' : 'Changing it changes public URLs.'
        }
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />

      <fieldset className="fieldset">
        <legend>Tier</legend>
        {TIERS.map((t) => (
          <label key={t} className="radio">
            <input
              type="radio"
              name="tier"
              value={t}
              defaultChecked={text('tier') === t}
              required
            />
            <span>
              <strong>{TIER_LABELS[t]}</strong> <span className="muted">· {TIER_HINTS[t]}</span>
            </span>
          </label>
        ))}
        {err('tier') && <small className="error">{err('tier')}</small>}
      </fieldset>

      <label className="field">
        <span>Region</span>
        <select
          name="regionId"
          defaultValue={text('regionId')}
          required
          aria-invalid={err('regionId') ? true : undefined}
        >
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {err('regionId') && <small className="error">{err('regionId')}</small>}
      </label>

      <Field
        label="Website"
        name="website"
        state={state}
        defaultValue={text('website')}
        placeholder="theoldglobe.org"
        inputMode="url"
        hint="Optional. https:// is added if you leave it off."
      />

      <fieldset className="fieldset">
        <legend>Listing</legend>
        <label className="radio">
          <input type="checkbox" name="inScope" defaultChecked={checked('inScope')} />
          <span>
            <strong>In scope</strong>{' '}
            <span className="muted">
              · List every production it mounts. Off for youth-only orgs, schools and clubs.
            </span>
          </span>
        </label>
        <label className="radio">
          <input type="checkbox" name="active" defaultChecked={checked('active')} />
          <span>
            <strong>Active</strong>{' '}
            <span className="muted">· Still producing. Off for closed companies.</span>
          </span>
        </label>
      </fieldset>

      <label className="field">
        <span>Notes</span>
        <textarea
          name="notes"
          rows={4}
          maxLength={2000}
          defaultValue={text('notes')}
          aria-invalid={err('notes') ? true : undefined}
        />
        {err('notes') ? (
          <small className="error">{err('notes')}</small>
        ) : (
          <small className="muted">
            Private. Ticketing platform, contacts, why it&rsquo;s out of scope…
          </small>
        )}
      </label>

      <div className="form-actions">
        <SubmitButton>{isNew ? 'Create company' : 'Save changes'}</SubmitButton>
        <Link href="/admin/companies">Cancel</Link>
      </div>
    </form>
  );
}
