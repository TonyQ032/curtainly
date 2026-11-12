'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/forms';
import { Field, FormMessage, SubmitButton } from '../_components/form';

export type VenueFormValues = {
  name: string;
  slug: string;
  address: string;
  regionId: string;
  website: string;
  lat: string;
  lng: string;
};

export function VenueForm({
  action,
  defaults,
  regions,
  isNew,
  attribution,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: VenueFormValues;
  regions: { id: string; name: string }[];
  isNew: boolean;
  attribution: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = (name: keyof VenueFormValues) => state.values?.[name] ?? defaults[name];
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');

  return (
    <form action={formAction} className="stack form" key={JSON.stringify(state.values ?? defaults)}>
      <FormMessage state={state} />

      <Field
        label="Name"
        name="name"
        state={state}
        defaultValue={v('name')}
        required
        maxLength={160}
      />
      <Field
        label="Slug"
        name="slug"
        state={state}
        defaultValue={v('slug')}
        placeholder={isNew ? 'Generated from the name' : undefined}
        hint={
          isNew ? 'Used in URLs. Leave blank to generate it.' : 'Changing it changes public URLs.'
        }
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />
      <Field
        label="Address"
        name="address"
        state={state}
        defaultValue={v('address')}
        required
        maxLength={300}
        placeholder="1363 Old Globe Way, San Diego, CA 92101"
        autoComplete="off"
        hint="Street, city, state and ZIP. Used to find the map location."
      />

      <label className="field">
        <span>Region</span>
        <select
          name="regionId"
          defaultValue={v('regionId')}
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
        defaultValue={v('website')}
        inputMode="url"
        hint="Optional. https:// is added if you leave it off."
      />

      <fieldset className="fieldset">
        <legend>Map location</legend>
        <div className="field-row">
          <Field
            label="Latitude"
            name="lat"
            state={state}
            defaultValue={v('lat')}
            inputMode="decimal"
          />
          <Field
            label="Longitude"
            name="lng"
            state={state}
            defaultValue={v('lng')}
            inputMode="decimal"
          />
        </div>
        <small className="muted">
          {isNew
            ? 'Leave blank to look it up from the address when you save.'
            : 'Clear both to look the address up again. A changed address is looked up automatically.'}{' '}
          Type coordinates to override the lookup. {attribution}.
        </small>
      </fieldset>

      <div className="form-actions">
        <SubmitButton pendingText={isNew ? 'Creating…' : 'Saving…'}>
          {isNew ? 'Create venue' : 'Save changes'}
        </SubmitButton>
        <Link href="/admin/venues">Cancel</Link>
      </div>
    </form>
  );
}
