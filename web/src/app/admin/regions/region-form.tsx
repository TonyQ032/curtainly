'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { REGION_STATUSES } from '@curtainly/shared';
import { initialFormState, type FormState } from '@/lib/forms';
import { Field, FormMessage, SubmitButton } from '../_components/form';

export type RegionFormValues = {
  name: string;
  slug: string;
  timezone: string;
  lat: string;
  lng: string;
  radiusMiles: string;
  status: string;
};

const STATUS_HINTS: Record<string, string> = {
  planned: 'Not started',
  building: 'Registry and sources in progress; not shown publicly',
  live: 'Shown publicly. Only once coverage is proven',
};

export function RegionForm({
  action,
  defaults,
  timeZones,
  isNew,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: RegionFormValues;
  timeZones: string[];
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  // After a failed submit, show what was typed rather than the original values.
  const v = (name: keyof RegionFormValues) => state.values?.[name] ?? defaults[name];
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');
  const formKey = JSON.stringify(state.values ?? defaults);

  return (
    <form action={formAction} className="stack form" key={formKey}>
      <FormMessage state={state} />

      <Field
        label="Name"
        name="name"
        state={state}
        defaultValue={v('name')}
        required
        maxLength={120}
      />
      <Field
        label="Slug"
        name="slug"
        state={state}
        defaultValue={v('slug')}
        placeholder={isNew ? 'Generated from the name' : undefined}
        hint={
          isNew
            ? 'Used in URLs, e.g. /sd/… Leave blank to generate it.'
            : 'Changing it changes public URLs.'
        }
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />

      <label className="field">
        <span>Timezone</span>
        <select
          name="timezone"
          defaultValue={v('timezone')}
          aria-invalid={err('timezone') ? true : undefined}
          required
        >
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        {err('timezone') ? (
          <small className="error">{err('timezone')}</small>
        ) : (
          <small className="muted">
            Used for &ldquo;Tonight&rdquo; and &ldquo;This weekend&rdquo; and for archiving.
          </small>
        )}
      </label>

      <fieldset className="fieldset">
        <legend>Center and radius</legend>
        <div className="field-row">
          <Field
            label="Latitude"
            name="lat"
            state={state}
            defaultValue={v('lat')}
            inputMode="decimal"
            required
          />
          <Field
            label="Longitude"
            name="lng"
            state={state}
            defaultValue={v('lng')}
            inputMode="decimal"
            required
          />
          <Field
            label="Radius (miles)"
            name="radiusMiles"
            state={state}
            defaultValue={v('radiusMiles')}
            type="number"
            min={1}
            max={500}
            step={1}
            required
          />
        </div>
        <small className="muted">
          Decimal degrees, e.g. 32.95, -117.0. Find them by right-clicking a spot in Google Maps.
        </small>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Status</legend>
        {REGION_STATUSES.map((s) => (
          <label key={s} className="radio">
            <input
              type="radio"
              name="status"
              value={s}
              defaultChecked={v('status') === s}
              required
            />
            <span>
              <strong>{s}</strong> <span className="muted">· {STATUS_HINTS[s]}</span>
            </span>
          </label>
        ))}
        {err('status') && <small className="error">{err('status')}</small>}
      </fieldset>

      <div className="form-actions">
        <SubmitButton>{isNew ? 'Create region' : 'Save changes'}</SubmitButton>
        <Link href="/admin/regions">Cancel</Link>
      </div>
    </form>
  );
}
