import type { WorkType } from '@curtainly/shared';
import type { FormState } from '@/lib/forms';

export type WorkOption = { id: string; title: string; type: WorkType; altTitles: string[] };

/** FormState plus the extra context a production save can return. */
export type ProductionFormState = FormState & {
  /** Existing Works matching a new work's title: pick one, or confirm a new work. */
  workMatches?: WorkOption[];
  /** Echoed back as `confirmNewWork` when the admin creates the new work anyway. */
  newWorkKey?: string;
  /** Another production of the same work by the same company with overlapping dates. */
  overlapping?: { id: string; label: string };
};
