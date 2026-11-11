import type { z } from 'zod';

/**
 * State returned by every admin form Server Action (used with useActionState).
 * `values` echoes what was submitted so inputs keep their contents after an
 * error (React resets uncontrolled forms when an action finishes).
 */
export type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: 'idle' };

type ParseResult<T> = { ok: true; data: T } | { ok: false; state: FormState };

/** Validate FormData against a zod schema, turning failures into a FormState. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParseResult<z.output<S>> {
  const values: Record<string, string> = {};
  const input: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION')) continue; // React's internal fields
    const all = formData.getAll(key).filter((v): v is string => typeof v === 'string');
    input[key] = all.length > 1 ? all : (all[0] ?? '');
    values[key] = all.join(', ');
  }

  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!key) formErrors.push(issue.message);
    else (fieldErrors[key] ??= []).push(issue.message);
  }

  return {
    ok: false,
    state: {
      status: 'error',
      message: formErrors[0] ?? 'Please fix the highlighted fields.',
      fieldErrors,
      values,
    },
  };
}
