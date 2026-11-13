'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { WORK_TYPES, WORK_TYPE_LABELS, type WorkMatch } from '@curtainly/shared';
import { initialFormState, type FormState } from '@/lib/forms';
import { FormMessage, SubmitButton } from '../../_components/form';
import {
  approveReviewItem,
  markNotAShow,
  mergeReviewItem,
  rejectReviewItem,
} from '../review-actions';
import { matchKindLabel } from '../review-item';

type Option = { id: string; name: string };

const fieldErr = (state: FormState, name: string) => state.fieldErrors?.[name]?.join(' ');

function ErrorText({ state, name }: { state: FormState; name: string }) {
  const e = fieldErr(state, name);
  return e ? <small className="error">{e}</small> : null;
}

/** The five review actions for a pending item. */
export function ReviewActions(props: {
  id: string;
  kind: 'new' | 'update';
  editHref: string;
  canApprove: boolean;
  canMarkNotAShow: boolean;
  proposedTitle: string;
  suggestions: WorkMatch[];
  preselectedWorkId: string;
  venues: Option[];
  venueId: string;
  inScope: boolean;
  productions: { id: string; label: string }[];
}) {
  return (
    <section className="related review-actions">
      <h2>Review</h2>
      <div className="review-action">
        <h3>Approve</h3>
        {!props.canApprove ? (
          <p className="muted">This item can’t be approved as is. Edit it, or reject it.</p>
        ) : props.kind === 'update' ? (
          <ApproveUpdate id={props.id} />
        ) : (
          <ApproveNew {...props} />
        )}
        <p>
          <Link href={props.editHref} className="button">
            Edit then approve
          </Link>{' '}
          <span className="muted">Opens the production form with these values filled in.</span>
        </p>
      </div>
      {props.kind === 'new' && props.canApprove && (
        <Merge id={props.id} productions={props.productions} />
      )}
      <Reject id={props.id} />
      {props.canMarkNotAShow && <NotAShow id={props.id} />}
    </section>
  );
}

function ApproveUpdate({ id }: { id: string }) {
  const [state, action] = useActionState(approveReviewItem.bind(null, id), initialFormState);
  return (
    <form action={action} className="stack">
      <FormMessage state={state} />
      <p className="muted">Applies the changes above to the production.</p>
      <div className="form-actions">
        <SubmitButton pendingText="Approving…">Approve changes</SubmitButton>
      </div>
    </form>
  );
}

function ApproveNew(props: Parameters<typeof ReviewActions>[0]) {
  const [state, action] = useActionState(approveReviewItem.bind(null, props.id), initialFormState);
  // Re-mount after an error so the fields show what was submitted.
  return (
    <ApproveNewFields
      key={JSON.stringify(state.values ?? {})}
      {...props}
      state={state}
      action={action}
    />
  );
}

function ApproveNewFields({
  state,
  action,
  proposedTitle,
  suggestions,
  preselectedWorkId,
  venues,
  venueId,
  inScope,
}: Parameters<typeof ReviewActions>[0] & {
  state: FormState;
  action: (formData: FormData) => void;
}) {
  const v = state.values;
  const [work, setWork] = useState(v?.work ?? (preselectedWorkId || 'new'));
  const publish = v ? v.publish === 'on' : inScope;

  return (
    <form action={action} className="stack form">
      <FormMessage state={state} />
      <fieldset className="fieldset">
        <legend>Work</legend>
        {suggestions.map((m) => (
          <label key={m.workId} className="radio">
            <input
              type="radio"
              name="work"
              value={m.workId}
              checked={work === m.workId}
              onChange={() => setWork(m.workId)}
            />
            <span>
              {m.title}{' '}
              <small className="muted">
                {matchKindLabel(m.kind)}, {Math.round(m.score * 100)}%
              </small>
            </span>
          </label>
        ))}
        <label className="radio">
          <input
            type="radio"
            name="work"
            value="new"
            checked={work === 'new'}
            onChange={() => setWork('new')}
          />
          <span>New work</span>
        </label>
        {work === 'new' && (
          <div className="field-row">
            <label className="field">
              <span>Title</span>
              <input
                name="newWorkTitle"
                defaultValue={v?.newWorkTitle ?? proposedTitle}
                maxLength={200}
                aria-invalid={fieldErr(state, 'newWorkTitle') ? true : undefined}
              />
              <ErrorText state={state} name="newWorkTitle" />
            </label>
            <label className="field">
              <span>Type</span>
              <select
                name="newWorkType"
                defaultValue={v?.newWorkType ?? ''}
                aria-invalid={fieldErr(state, 'newWorkType') ? true : undefined}
              >
                <option value="" disabled>
                  Pick a type
                </option>
                {WORK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WORK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <ErrorText state={state} name="newWorkType" />
            </label>
          </div>
        )}
        <ErrorText state={state} name="work" />
      </fieldset>

      <label className="field">
        <span>Venue</span>
        <select
          name="venueId"
          defaultValue={v?.venueId ?? venueId}
          required
          aria-invalid={fieldErr(state, 'venueId') ? true : undefined}
        >
          <option value="" disabled>
            Pick a venue
          </option>
          {venues.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {fieldErr(state, 'venueId') ? (
          <ErrorText state={state} name="venueId" />
        ) : (
          <small className="muted">
            Preselected from the source’s venue name.{' '}
            <Link href="/admin/venues/new">New venue</Link>
          </small>
        )}
      </label>

      <label className="radio">
        <input type="checkbox" name="publish" defaultChecked={publish} disabled={!inScope} />
        <span>
          Publish now <small className="muted">Otherwise it’s saved as a draft.</small>
        </span>
      </label>
      <ErrorText state={state} name="publish" />

      <div className="form-actions">
        <SubmitButton pendingText="Approving…">Approve</SubmitButton>
      </div>
    </form>
  );
}

function Merge({ id, productions }: { id: string; productions: { id: string; label: string }[] }) {
  const [state, action] = useActionState(mergeReviewItem.bind(null, id), initialFormState);
  return (
    <div className="review-action">
      <h3>Merge into an existing production</h3>
      {productions.length === 0 ? (
        <p className="muted">This company has no productions yet.</p>
      ) : (
        <form action={action} className="stack form">
          <FormMessage state={state} />
          <label className="field">
            <span>Production</span>
            <select
              name="productionId"
              key={state.values?.productionId}
              defaultValue={state.values?.productionId ?? ''}
              required
              aria-invalid={fieldErr(state, 'productionId') ? true : undefined}
            >
              <option value="" disabled>
                Pick a production
              </option>
              {productions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {fieldErr(state, 'productionId') ? (
              <ErrorText state={state} name="productionId" />
            ) : (
              <small className="muted">
                Adds its upcoming performances and changed facts; removes nothing. Its title is
                saved as an alt title so the next run matches.
              </small>
            )}
          </label>
          <div className="form-actions">
            <SubmitButton pendingText="Merging…">Merge</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

function Reject({ id }: { id: string }) {
  const [state, action] = useActionState(rejectReviewItem.bind(null, id), initialFormState);
  return (
    <div className="review-action">
      <h3>Reject</h3>
      <form action={action} className="stack form">
        <FormMessage state={state} />
        <label className="field">
          <span>Reason</span>
          <textarea
            name="reason"
            rows={2}
            maxLength={500}
            key={state.values?.reason}
            defaultValue={state.values?.reason ?? ''}
            aria-invalid={fieldErr(state, 'reason') ? true : undefined}
          />
          {fieldErr(state, 'reason') ? (
            <ErrorText state={state} name="reason" />
          ) : (
            <small className="muted">
              The same proposal isn’t queued again; it comes back if the source changes it.
            </small>
          )}
        </label>
        <div className="form-actions">
          <SubmitButton pendingText="Rejecting…">Reject</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function NotAShow({ id }: { id: string }) {
  const [state, action] = useActionState(markNotAShow.bind(null, id), initialFormState);
  return (
    <div className="review-action">
      <h3>Not a show</h3>
      <form action={action} className="stack">
        <FormMessage state={state} />
        <p className="muted">
          A gala, class, camp or audition. This source’s listing is never queued again.
        </p>
        <div className="form-actions">
          <SubmitButton pendingText="Saving…">Mark not a show</SubmitButton>
        </div>
      </form>
    </div>
  );
}
