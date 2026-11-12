'use client';

import { useState } from 'react';
import { isIsoDate, weekday } from '@curtainly/shared';
import { useKeyedRows } from '../_components/use-keyed-rows';
import {
  generateSchedule,
  MAX_PERFORMANCES,
  mergeRows,
  scheduleProblem,
  WEEKDAYS,
  type PerformanceRow,
  type ScheduleSlot,
} from './performances';

function readRows(json: string): PerformanceRow[] {
  try {
    const parsed: unknown = JSON.parse(json || '[]');
    if (Array.isArray(parsed)) return parsed as PerformanceRow[];
  } catch {
    // Unreadable echo: start empty rather than crash.
  }
  return [];
}

const DEFAULT_SLOTS: ScheduleSlot[] = [
  { days: [4, 5, 6], time: '19:30' },
  { days: [6, 0], time: '14:00' },
];

/**
 * Performances as editable date / time / venue / notes rows, posted as JSON in
 * one hidden field. "Add a weekly schedule" fills in many at once.
 */
export function PerformanceEditor({
  name,
  defaultValue,
  venues,
  timezone,
  runStart,
  runEnd,
  error,
}: {
  name: string;
  defaultValue: string;
  venues: { id: string; name: string }[];
  /** IANA zone the times are in (the venue's region). */
  timezone?: string;
  /** The production's dates, used as the schedule's default range. */
  runStart: string;
  runEnd: string;
  error?: string;
}) {
  const { rows, add, remove, update, replace } = useKeyedRows(readRows(defaultValue));
  const [initialCount] = useState(rows.length);
  const errorId = `${name}-error`;
  const last = rows.at(-1)?.value;

  return (
    <fieldset className="fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Performances</legend>
      <small className="muted">
        {timezone ? <>Local times at the venue ({timezone}). </> : null}
        Notes are for facts like &ldquo;Preview&rdquo;, &ldquo;ASL interpreted&rdquo; or
        &ldquo;Opening night&rdquo;.
      </small>
      <input type="hidden" name={name} value={JSON.stringify(rows.map((r) => r.value))} />

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table performance-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col">Venue</th>
                <th scope="col">Notes</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, value }, i) => (
                <tr key={key}>
                  <td>
                    <span className="date-cell">
                      <input
                        type="date"
                        value={value.date}
                        onChange={(e) => update(key, { ...value, date: e.target.value })}
                        aria-label={`Performance ${i + 1} date`}
                        autoFocus={i === rows.length - 1 && i >= initialCount && !value.notes}
                      />
                      <span className="muted weekday" aria-hidden>
                        {isIsoDate(value.date) ? WEEKDAYS[weekday(value.date)]!.short : ''}
                      </span>
                    </span>
                  </td>
                  <td>
                    <input
                      type="time"
                      value={value.time}
                      onChange={(e) => update(key, { ...value, time: e.target.value })}
                      aria-label={`Performance ${i + 1} time`}
                    />
                  </td>
                  <td>
                    <select
                      value={value.venueId}
                      onChange={(e) => update(key, { ...value, venueId: e.target.value })}
                      aria-label={`Performance ${i + 1} venue`}
                    >
                      <option value="">Production venue</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={value.notes}
                      onChange={(e) => update(key, { ...value, notes: e.target.value })}
                      aria-label={`Performance ${i + 1} notes`}
                      maxLength={200}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => remove(key)}>
                      Remove<span className="visually-hidden"> performance {i + 1}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="editor-actions">
        <button
          type="button"
          disabled={rows.length >= MAX_PERFORMANCES}
          onClick={() =>
            add({
              date: last?.date ?? runStart,
              time: last?.time ?? '19:30',
              venueId: '',
              notes: '',
            })
          }
        >
          Add performance
        </button>
        {rows.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove all ${rows.length} performances?`)) replace([]);
            }}
          >
            Remove all
          </button>
        )}
        <span className="muted">
          {rows.length} {rows.length === 1 ? 'performance' : 'performances'}
        </span>
      </div>

      <ScheduleBuilder
        runStart={runStart}
        runEnd={runEnd}
        room={MAX_PERFORMANCES - rows.length}
        onAdd={(generated) => {
          const merged = mergeRows(
            rows.map((r) => r.value),
            generated,
          );
          replace(merged.rows);
          return merged;
        }}
      />

      {error && (
        <small id={errorId} className="error">
          {error}
        </small>
      )}
    </fieldset>
  );
}

/** Bulk add: chosen weekdays at set times between two dates. */
function ScheduleBuilder({
  runStart,
  runEnd,
  room,
  onAdd,
}: {
  runStart: string;
  runEnd: string;
  /** How many more performances fit under the limit. */
  room: number;
  onAdd: (generated: { date: string; time: string }[]) => { added: number; skipped: number };
}) {
  // Blank means "follow the production's dates".
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [message, setMessage] = useState('');

  const schedule = { from: from || runStart, to: to || runEnd, slots };
  const problem = scheduleProblem(schedule);
  const generated = problem ? [] : generateSchedule(schedule);
  const tooMany = generated.length > room;

  const setSlot = (i: number, slot: ScheduleSlot) =>
    setSlots((all) => all.map((s, j) => (j === i ? slot : s)));
  const toggleDay = (i: number, day: number) => {
    const slot = slots[i]!;
    const days = slot.days.includes(day) ? slot.days.filter((d) => d !== day) : [...slot.days, day];
    setSlot(i, { ...slot, days });
  };

  return (
    <details className="schedule">
      <summary>Add a weekly schedule</summary>
      <div className="stack">
        <div className="field-row">
          <label className="field">
            <span>From</span>
            <input type="date" value={schedule.from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={schedule.to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <ul className="editor-rows">
          {slots.map((slot, i) => (
            <li key={i} className="editor-row schedule-slot">
              <span className="day-toggles" role="group" aria-label={`Time ${i + 1} days`}>
                {WEEKDAYS.map((d) => (
                  <label key={d.value} className="day-toggle">
                    <input
                      type="checkbox"
                      checked={slot.days.includes(d.value)}
                      onChange={() => toggleDay(i, d.value)}
                    />
                    <span>
                      <span aria-hidden>{d.short}</span>
                      <span className="visually-hidden">{d.long}</span>
                    </span>
                  </label>
                ))}
              </span>
              <span className="muted" aria-hidden>
                at
              </span>
              <input
                type="time"
                value={slot.time}
                onChange={(e) => setSlot(i, { ...slot, time: e.target.value })}
                aria-label={`Time ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}
              >
                Remove<span className="visually-hidden"> time {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="editor-actions">
          <button
            type="button"
            onClick={() => setSlots((all) => [...all, { days: [], time: '19:30' }])}
          >
            Add another time
          </button>
        </div>

        <div className="editor-actions">
          <button
            type="button"
            className="primary"
            disabled={generated.length === 0 || tooMany}
            onClick={() => {
              const { added, skipped } = onAdd(generated);
              setMessage(
                `Added ${added} ${added === 1 ? 'performance' : 'performances'}.` +
                  (skipped ? ` ${skipped} already listed.` : ''),
              );
            }}
          >
            {generated.length
              ? `Add ${generated.length} ${generated.length === 1 ? 'performance' : 'performances'}`
              : 'Add performances'}
          </button>
          <span role="status" className="muted">
            {problem ??
              (tooMany ? `That's more than the ${MAX_PERFORMANCES}-performance limit.` : message)}
          </span>
        </div>
      </div>
    </details>
  );
}
