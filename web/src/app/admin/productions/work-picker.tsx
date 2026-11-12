'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { WORK_TYPES, WORK_TYPE_LABELS, type WorkType } from '@curtainly/shared';
import { searchWorks } from './actions';
import type { WorkOption } from './form-state';

type Picked = Pick<WorkOption, 'id' | 'title' | 'type'>;

function readPicked(workId: string, label: string): Picked | null {
  if (!workId) return null;
  try {
    const parsed = JSON.parse(label) as Picked;
    if (parsed?.id === workId && typeof parsed.title === 'string') return parsed;
  } catch {
    // Fall through: the id alone isn't enough to show the work.
  }
  return null;
}

/**
 * Choose the production's Work: search existing works by title, or create a new
 * one with just a title and type (credits are added on the work's page later).
 * Posts `workId` (+ `workLabel`, only to restore the picker after an error), or
 * `newWorkTitle` and `newWorkType`.
 */
export function WorkPicker({
  defaults,
  error,
  matches,
  newWorkKey,
}: {
  defaults: { workId: string; workLabel: string; newWorkTitle: string; newWorkType: string };
  error?: string;
  /** Existing works that match a new work's title, from the last save attempt. */
  matches?: WorkOption[];
  newWorkKey?: string;
}) {
  const [picked, setPicked] = useState(() => readPicked(defaults.workId, defaults.workLabel));
  const [creating, setCreating] = useState(!picked && defaults.newWorkTitle !== '');
  const [newTitle, setNewTitle] = useState(defaults.newWorkTitle);
  const [newType, setNewType] = useState(defaults.newWorkType);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; works: WorkOption[] } | null>(null);
  const [searching, startSearch] = useTransition();
  const latest = useRef('');
  const errorId = 'workId-error';

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const works = await searchWorks(q);
        // Ignore a slow response to an earlier query.
        if (latest.current === q) setFound({ q, works });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Only results for what's in the box now, never a previous query's.
  const results = found && found.q === query.trim() ? found.works : null;

  const pick = (w: Picked) => {
    setPicked({ id: w.id, title: w.title, type: w.type });
    setCreating(false);
    setQuery('');
  };

  return (
    <fieldset className="fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Work</legend>
      <input type="hidden" name="workId" value={picked?.id ?? ''} />
      <input type="hidden" name="workLabel" value={picked ? JSON.stringify(picked) : ''} />

      {picked ? (
        <div className="picked">
          <strong>{picked.title}</strong>
          <span className="badge">{WORK_TYPE_LABELS[picked.type]}</span>
          <Link href={`/admin/works/${picked.id}`} target="_blank">
            View work
          </Link>
          <button type="button" onClick={() => setPicked(null)}>
            Change
          </button>
        </div>
      ) : creating ? (
        <>
          <label className="field">
            <span>New work title</span>
            <input
              name="newWorkTitle"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={200}
              required
              aria-invalid={error ? true : undefined}
            />
          </label>
          <div className="inline-options" role="radiogroup" aria-label="New work type">
            {WORK_TYPES.map((t) => (
              <label key={t} className="radio">
                <input
                  type="radio"
                  name="newWorkType"
                  value={t}
                  checked={newType === t}
                  onChange={() => setNewType(t)}
                  required
                />
                <span>{WORK_TYPE_LABELS[t as WorkType]}</span>
              </label>
            ))}
          </div>
          <small className="muted">
            As the rights holder lists it. Add credits and alt titles on the work&rsquo;s page after
            saving.
          </small>

          {matches && matches.length > 0 && newWorkKey && (
            <div className="callout" role="group" aria-label="Existing works with this title">
              <p>
                Productions of the same show should share one work. Use one of these unless
                it&rsquo;s a different show:
              </p>
              <ul className="picker-results">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => pick(m)}>
                      Use {m.title}
                      <span className="visually-hidden"> ({WORK_TYPE_LABELS[m.type]})</span>
                    </button>{' '}
                    <span className="muted">· {WORK_TYPE_LABELS[m.type]}</span>
                  </li>
                ))}
              </ul>
              <label className="radio">
                <input type="checkbox" name="confirmNewWork" value={newWorkKey} />
                <span>It&rsquo;s a different work. Create it anyway.</span>
              </label>
            </div>
          )}

          <div>
            <button type="button" onClick={() => setCreating(false)}>
              Search existing works instead
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter picks the top result instead of submitting the form.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (results?.[0]) pick(results[0]);
            }}
            placeholder="Search works by title"
            aria-label="Search works by title"
            aria-invalid={error ? true : undefined}
            aria-controls="work-results"
            autoComplete="off"
          />
          <div id="work-results" aria-live="polite">
            {results && results.length > 0 && (
              <ul className="picker-results">
                {results.map((w) => (
                  <li key={w.id}>
                    <button type="button" onClick={() => pick(w)}>
                      {w.title}
                    </button>{' '}
                    <span className="muted">
                      · {WORK_TYPE_LABELS[w.type]}
                      {w.altTitles.length > 0 && ` · also ${w.altTitles.join(', ')}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {results?.length === 0 && !searching && (
              <small className="muted">No works match &ldquo;{query.trim()}&rdquo;.</small>
            )}
            {searching && <small className="muted">Searching…</small>}
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                if (query.trim()) setNewTitle(query.trim());
              }}
            >
              {query.trim() ? `Create new work “${query.trim()}”` : 'Create a new work'}
            </button>
          </div>
        </>
      )}

      {error && (
        <small id={errorId} className="error">
          {error}
        </small>
      )}
    </fieldset>
  );
}
