import type { FormState } from './forms';

/** Postgres unique_violation (23505), however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Echo submitted values back so the form keeps what was typed. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (key.startsWith('$ACTION') || typeof value !== 'string') continue;
    values[key] = values[key] ? `${values[key]}, ${value}` : value;
  }
  return values;
}

/** A FormState error on specific fields, keeping the submitted values. */
export function fieldError(
  formData: FormData,
  fieldErrors: Record<string, string[]>,
  message = 'Please fix the highlighted fields.',
): FormState {
  return { status: 'error', message, fieldErrors, values: formValues(formData) };
}
