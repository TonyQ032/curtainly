'use client';

import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/forms';

/**
 * Building blocks for admin forms. Pair with a Server Action that returns
 * FormState (see lib/forms.ts) via useActionState:
 *
 *   const [state, action] = useActionState(saveRegion, initialFormState);
 *   <form action={action}>
 *     <FormMessage state={state} />
 *     <Field label="Name" name="name" state={state} defaultValue={region.name} required />
 *     <SubmitButton>Save</SubmitButton>
 *   </form>
 */

type FieldProps = {
  label: string;
  name: string;
  state?: FormState;
  hint?: string;
  /** Render a custom control (select, textarea…) instead of the default <input>. */
  children?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'children'>;

export function Field({ label, name, state, hint, children, defaultValue, ...input }: FieldProps) {
  const errors = state?.fieldErrors?.[name];
  const errorId = errors ? `${name}-error` : undefined;
  const value = state?.values?.[name] ?? defaultValue;

  return (
    <label className="field">
      <span>{label}</span>
      {children ?? (
        <input
          name={name}
          // Re-mount when the echoed value changes so the input shows it.
          key={state?.values ? `${name}:${value}` : name}
          defaultValue={value}
          aria-invalid={errors ? true : undefined}
          aria-describedby={errorId}
          {...input}
        />
      )}
      {hint && !errors && <small className="muted">{hint}</small>}
      {errors && (
        <small id={errorId} className="error">
          {errors.join(' ')}
        </small>
      )}
    </label>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === 'error' ? 'alert' : 'status'}
      className={state.status === 'error' ? 'error' : 'success'}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingText = 'Saving…',
}: {
  children: React.ReactNode;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
