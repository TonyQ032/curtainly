'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { WORK_TYPES, WORK_TYPE_LABELS } from '@curtainly/shared';
import { Field, FormMessage, SubmitButton } from '../_components/form';
import type { WorkFormState } from './form-state';
import { AltTitlesEditor, CreditsEditor } from './list-editors';

export type WorkFormValues = {
  title: string;
  slug: string;
  type: string;
  /** Newline-separated. */
  altTitles: string;
  /** JSON array of CreditRow. */
  authors: string;
};

const initialState: WorkFormState = { status: 'idle' };

export function WorkForm({
  action,
  defaults,
  isNew,
}: {
  action: (state: WorkFormState, formData: FormData) => Promise<WorkFormState>;
  defaults: WorkFormValues;
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  // After a failed submit, show what was typed.
  const v = (name: keyof WorkFormValues) => state.values?.[name] ?? defaults[name];
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');
  const type = v('type');

  return (
    <form action={formAction} className="stack form" key={JSON.stringify(state.values ?? defaults)}>
      <FormMessage state={state} />

      {state.duplicates && state.duplicateKey && (
        <div className="callout" role="group" aria-label="Possible duplicate">
          <p>
            Check these before creating another work. Productions of the same show should share one
            work; add other names as alt titles instead.
          </p>
          <ul>
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/works/${d.id}`} target="_blank">
                  {d.title}
                </Link>{' '}
                <span className="muted">· {WORK_TYPE_LABELS[d.type]}</span>
              </li>
            ))}
          </ul>
          <label className="radio">
            <input type="checkbox" name="confirmDuplicate" value={state.duplicateKey} />
            <span>It&rsquo;s a different work. Save anyway.</span>
          </label>
        </div>
      )}

      <Field
        label="Title"
        name="title"
        state={state}
        defaultValue={v('title')}
        required
        maxLength={200}
        hint="As the rights holder lists it, e.g. Into the Woods (not Into the Woods JR.)."
      />
      <Field
        label="Slug"
        name="slug"
        state={state}
        defaultValue={v('slug')}
        placeholder={isNew ? 'Generated from the title' : undefined}
        hint={
          isNew ? 'Used in URLs. Leave blank to generate it.' : 'Changing it changes public URLs.'
        }
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />

      <fieldset className="fieldset">
        <legend>Type</legend>
        {WORK_TYPES.map((t) => (
          <label key={t} className="radio">
            <input type="radio" name="type" value={t} defaultChecked={type === t} required />
            <span>{WORK_TYPE_LABELS[t]}</span>
          </label>
        ))}
        {err('type') && <small className="error">{err('type')}</small>}
      </fieldset>

      <AltTitlesEditor name="altTitles" defaultValue={v('altTitles')} error={err('altTitles')} />
      <CreditsEditor
        name="authors"
        defaultValue={v('authors')}
        defaultRole={type === 'play' ? 'playwright' : 'book'}
        error={err('authors')}
      />

      <div className="form-actions">
        <SubmitButton>{isNew ? 'Create work' : 'Save changes'}</SubmitButton>
        <Link href="/admin/works">Cancel</Link>
      </div>
    </form>
  );
}
