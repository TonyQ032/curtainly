'use client';

import { CREDIT_ROLES, CREDIT_ROLE_LABELS } from '@curtainly/shared';
import { useKeyedRows } from '../_components/use-keyed-rows';
import { MAX_ALT_TITLES, MAX_CREDIT_ROWS, type CreditRow } from './schema';

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <small id={id} className="error">
      {error}
    </small>
  ) : null;
}

/** Alt titles as a list of inputs, posted as one newline-separated hidden field. */
export function AltTitlesEditor({
  name,
  defaultValue,
  error,
}: {
  name: string;
  defaultValue: string;
  error?: string;
}) {
  const initial = defaultValue.split('\n').filter((t) => t.trim());
  const { rows, add, remove, update } = useKeyedRows(initial);
  const errorId = `${name}-error`;

  return (
    <fieldset className="fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Alt titles</legend>
      <small className="muted">
        Other names it&rsquo;s listed under: translations, short forms, former titles. Editions like
        &ldquo;JR.&rdquo; or &ldquo;The Musical&rdquo; already match without being listed.
      </small>
      <input type="hidden" name={name} value={rows.map((r) => r.value).join('\n')} />
      {rows.length > 0 && (
        <ul className="editor-rows">
          {rows.map((row, i) => (
            <li key={row.key} className="editor-row">
              <input
                value={row.value}
                onChange={(e) => update(row.key, e.target.value.replace(/[\r\n]/g, ' '))}
                aria-label={`Alt title ${i + 1}`}
                aria-invalid={error ? true : undefined}
                maxLength={200}
                autoFocus={row.value === '' && i === rows.length - 1 && i >= initial.length}
              />
              <button type="button" onClick={() => remove(row.key)}>
                Remove<span className="visually-hidden"> alt title {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" onClick={() => add('')} disabled={rows.length >= MAX_ALT_TITLES}>
          Add alt title
        </button>
      </div>
      <ErrorText id={errorId} error={error} />
    </fieldset>
  );
}

const ROLE_OPTIONS = [
  ...CREDIT_ROLES.map((r) => ({ value: r, label: CREDIT_ROLE_LABELS[r] })),
  { value: 'other', label: 'Other…' },
] as const;

/** Author credits as role + names rows, posted as JSON in one hidden field. */
export function CreditsEditor({
  name,
  defaultValue,
  defaultRole,
  error,
}: {
  name: string;
  defaultValue: string;
  /** Role for a newly added row. */
  defaultRole: CreditRow['role'];
  error?: string;
}) {
  let initial: CreditRow[] = [];
  try {
    const parsed: unknown = JSON.parse(defaultValue || '[]');
    if (Array.isArray(parsed)) initial = parsed as CreditRow[];
  } catch {
    // Unreadable echo: start empty rather than crash.
  }
  const { rows, add, remove, update } = useKeyedRows(initial);
  const errorId = `${name}-error`;
  const blank = (): CreditRow => ({ role: defaultRole, customRole: '', names: '' });

  return (
    <fieldset className="fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Credits</legend>
      <small className="muted">
        Separate several names with commas. Leave a row empty to drop it.
      </small>
      <input type="hidden" name={name} value={JSON.stringify(rows.map((r) => r.value))} />
      {rows.length > 0 && (
        <ul className="editor-rows">
          {rows.map(({ key, value }, i) => (
            <li key={key} className="editor-row credit-row">
              <select
                value={value.role}
                onChange={(e) =>
                  update(key, { ...value, role: e.target.value as CreditRow['role'] })
                }
                aria-label={`Credit ${i + 1} role`}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {value.role === 'other' && (
                <input
                  value={value.customRole}
                  onChange={(e) => update(key, { ...value, customRole: e.target.value })}
                  aria-label={`Credit ${i + 1} role name`}
                  placeholder="Role, e.g. Adapted by"
                  maxLength={80}
                  aria-invalid={error && !value.customRole.trim() ? true : undefined}
                />
              )}
              <input
                value={value.names}
                onChange={(e) => update(key, { ...value, names: e.target.value })}
                aria-label={`Credit ${i + 1} names`}
                placeholder="Names"
                autoFocus={i === rows.length - 1 && i >= initial.length && value.names === ''}
              />
              <button type="button" onClick={() => remove(key)}>
                Remove<span className="visually-hidden"> credit {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => add(blank())}
          disabled={rows.length >= MAX_CREDIT_ROWS}
        >
          Add credit
        </button>
      </div>
      <ErrorText id={errorId} error={error} />
    </fieldset>
  );
}
