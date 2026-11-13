import { utcToZoned, type DiffField, type ProductionDiff, type WorkMatch } from '@curtainly/shared';
import { formatDateRange } from '@/lib/dates';

/** Display helpers for the review queue list. Pure, so they're unit-tested without a database. */

export const REVIEW_TYPES = ['new', 'update'] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  new: 'New',
  update: 'Update',
};

/** An item that links to a production updates it; anything else proposes a new one. */
export function reviewType(productionId: string | null): ReviewType {
  return productionId ? 'update' : 'new';
}

/** `review_items.proposed` as the list reads it: stored JSON, so every field is checked. */
type Proposed = { title?: unknown; performances?: unknown };

export function proposedTitle(proposed: unknown): string {
  const title = (proposed as Proposed | null)?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : 'Untitled';
}

/** Performance count and local date range, e.g. "8 · Mar 4 – Apr 2, 2027". */
export function performanceSummary(proposed: unknown, timeZone: string): string | null {
  const list = (proposed as Proposed | null)?.performances;
  if (!Array.isArray(list)) return null;
  const instants = list
    .map((p) => new Date((p as { startsAt?: unknown })?.startsAt as string).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (instants.length === 0) return null;
  const first = utcToZoned(new Date(instants[0]!), timeZone).date;
  const last = utcToZoned(new Date(instants[instants.length - 1]!), timeZone).date;
  return `${instants.length} · ${formatDateRange(first, last)}`;
}

const FIELD_LABELS: Record<DiffField, string> = {
  priceMin: 'price',
  priceMax: 'price',
  ticketUrl: 'ticket URL',
  advisory: 'advisory',
  runtimeMin: 'runtime',
};

/** One line for an update's diff: "+2 / −1 performances, dates, price". */
export function diffSummary(diff: ProductionDiff | null): string {
  if (!diff) return 'No changes recorded';
  const parts: string[] = [];
  const { added, removed } = diff.performances;
  if (added.length || removed.length) {
    const counts = [added.length && `+${added.length}`, removed.length && `−${removed.length}`];
    parts.push(`${counts.filter(Boolean).join(' / ')} performances`);
  }
  if (diff.dates) parts.push('dates');
  for (const label of new Set(diff.fields.map((f) => FIELD_LABELS[f.field]))) parts.push(label);
  return parts.length ? parts.join(', ') : 'No changes recorded';
}

/** The best Work suggestion for a new item: "Hamilton (0.98)", or null without any. */
export function topSuggestion(matches: readonly WorkMatch[]): string | null {
  const best = matches[0];
  return best ? `${best.title} (${best.score.toFixed(2)})` : null;
}
