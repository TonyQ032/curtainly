/**
 * When a source earns `auto_approve` (#27, rule decided in #29; see
 * docs/DECISIONS.md). A source is eligible once its most recent reviewed items
 * are an unbroken streak of at least `AUTO_APPROVE_MIN_CLEAN` approvals without
 * edits, ingested over at least `AUTO_APPROVE_MIN_DAYS` days.
 *
 * - Clean: approved as proposed (not "edit then approve").
 * - Breaks the streak: approved after edits, rejected, or merged.
 * - Neutral: "not a show" (the filter rule handles those) and items the
 *   source auto-approved itself (`reviewer = AUTO_REVIEWER`).
 */

/** `review_items.reviewer` for updates published by an auto-approve source. */
export const AUTO_REVIEWER = 'auto-approve';

export const AUTO_APPROVE_MIN_CLEAN = 10;
export const AUTO_APPROVE_MIN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A source's current streak: clean approvals since its last break. */
export type CleanStreak = {
  /** Clean approvals since the last break (or ever, if none). */
  clean: number;
  /** Ingest time (`created_at`) of the oldest and newest item in the streak. */
  firstAt: Date | null;
  lastAt: Date | null;
  /** When the last break was reviewed, if any. */
  brokenAt: Date | null;
};

export type AutoApproveEligibility = CleanStreak & {
  /** Whole days between the oldest and newest item in the streak. */
  days: number;
  eligible: boolean;
};

export const EMPTY_STREAK: CleanStreak = { clean: 0, firstAt: null, lastAt: null, brokenAt: null };

export function autoApproveEligibility(streak: CleanStreak): AutoApproveEligibility {
  const { firstAt, lastAt } = streak;
  const days = firstAt && lastAt ? Math.floor((lastAt.getTime() - firstAt.getTime()) / DAY_MS) : 0;
  return {
    ...streak,
    days,
    eligible: streak.clean >= AUTO_APPROVE_MIN_CLEAN && days >= AUTO_APPROVE_MIN_DAYS,
  };
}
