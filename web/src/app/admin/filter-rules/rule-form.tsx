'use client';

import { useActionState } from 'react';
import { initialFormState } from '@/lib/forms';
import { Field, FormMessage, SubmitButton } from '../_components/form';
import { createFilterRule } from './actions';

export function FilterRuleForm({
  sources,
  defaultScope,
}: {
  sources: { id: string; label: string }[];
  defaultScope: string;
}) {
  const [state, action] = useActionState(createFilterRule, initialFormState);
  const scopeError = state.fieldErrors?.scope;
  return (
    <form action={action} className="stack form">
      <FormMessage state={state} />
      <div className="field-row">
        <Field
          label="Keyword or phrase"
          name="keyword"
          state={state}
          maxLength={100}
          required
          hint="Matched as whole words in the title, ignoring case and punctuation."
        />
        <Field label="Applies to" name="scope" state={state}>
          <select
            name="scope"
            key={state.values?.scope ?? defaultScope}
            defaultValue={state.values?.scope ?? defaultScope}
            aria-invalid={scopeError ? true : undefined}
          >
            <option value="global">Every source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted">
        Pending items the rule matches are closed as “not a show”. Matching listings are counted on
        each run but never queued, so keep keywords specific.
      </p>
      <div className="form-actions">
        <SubmitButton pendingText="Adding…">Add rule</SubmitButton>
      </div>
    </form>
  );
}
