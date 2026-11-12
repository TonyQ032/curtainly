'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { SOURCE_KINDS, type SourceKind } from '@curtainly/shared';
import { initialFormState, type FormState } from '@/lib/forms';
import { Field, FormMessage, SubmitButton } from '../_components/form';
import { SOURCE_CONFIG_EXAMPLES, SOURCE_KIND_LABELS } from './config';

export type SourceFormValues = {
  companyId: string;
  kind: string;
  config: string;
  enabled: boolean;
  autoApprove: boolean;
};

export function SourceForm({
  action,
  defaults,
  companies,
  isNew,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: SourceFormValues;
  companies: { id: string; name: string }[];
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const sent = state.values;
  const [kind, setKind] = useState<string>(sent?.kind ?? defaults.kind);
  const example = SOURCE_CONFIG_EXAMPLES[kind as SourceKind];
  const text = (name: 'companyId' | 'config') => sent?.[name] ?? defaults[name];
  const checked = (name: 'enabled' | 'autoApprove') =>
    sent ? sent[name] === 'on' : defaults[name];
  const err = (name: string) => state.fieldErrors?.[name]?.join(' ');

  return (
    <form action={formAction} className="stack form" key={JSON.stringify(sent ?? defaults)}>
      <FormMessage state={state} />

      <label className="field">
        <span>Company</span>
        <select
          name="companyId"
          defaultValue={text('companyId')}
          required
          aria-invalid={err('companyId') ? true : undefined}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {err('companyId') && <small className="error">{err('companyId')}</small>}
      </label>

      <label className="field">
        <span>Kind</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          required
          aria-invalid={err('kind') ? true : undefined}
        >
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SOURCE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {err('kind') && <small className="error">{err('kind')}</small>}
      </label>

      <Field
        label="Config (JSON)"
        name="config"
        state={state}
        hint={`Example: ${JSON.stringify(example)}`}
      >
        <textarea
          name="config"
          rows={5}
          spellCheck={false}
          className="mono"
          maxLength={5000}
          defaultValue={text('config')}
          placeholder={JSON.stringify(example, null, 2)}
          aria-invalid={err('config') ? true : undefined}
        />
      </Field>

      <fieldset className="fieldset">
        <legend>Behavior</legend>
        <label className="radio">
          <input type="checkbox" name="enabled" defaultChecked={checked('enabled')} />
          <span>
            <strong>Enabled</strong>{' '}
            <span className="muted">· The daily run includes this source.</span>
          </span>
        </label>
        <label className="radio">
          <input type="checkbox" name="autoApprove" defaultChecked={checked('autoApprove')} />
          <span>
            <strong>Auto-approve</strong>{' '}
            <span className="muted">
              · Publish updates directly (still logged to the review queue). Only after about 10
              clean reviewed runs.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="form-actions">
        <SubmitButton>{isNew ? 'Create source' : 'Save changes'}</SubmitButton>
        <Link href="/admin/sources">Cancel</Link>
      </div>
    </form>
  );
}
