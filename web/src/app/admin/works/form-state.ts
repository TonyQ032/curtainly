import type { WorkType } from '@curtainly/shared';
import type { FormState } from '@/lib/forms';

export type DuplicateWork = { id: string; title: string; type: WorkType };

/** FormState plus the Works a save would likely duplicate. */
export type WorkFormState = FormState & {
  duplicates?: DuplicateWork[];
  /** Echoed back as `confirmDuplicate` when the admin chooses to save anyway. */
  duplicateKey?: string;
};
