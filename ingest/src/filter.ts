/**
 * Non-show filter step (#26): candidates whose title matches a global or
 * source rule are counted and logged, never queued. Pure; rules come from a
 * `FilterRuleStore`.
 */
import { findFilterRule, type FilterRule } from '@curtainly/shared';
import type { CandidateProduction } from './types';

export interface FilterRuleStore {
  /** Every rule, global and per source. Called once per run. */
  loadRules(): Promise<FilterRule[]>;
}

export interface FilteredCandidate {
  title: string;
  keyword: string;
}

export function filterCandidates(
  candidates: readonly CandidateProduction[],
  sourceId: string,
  rules: readonly FilterRule[],
): { kept: CandidateProduction[]; filtered: FilteredCandidate[] } {
  const kept: CandidateProduction[] = [];
  const filtered: FilteredCandidate[] = [];
  for (const candidate of candidates) {
    const rule = findFilterRule(candidate.title, sourceId, rules);
    if (rule) filtered.push({ title: candidate.title, keyword: rule.keyword });
    else kept.push(candidate);
  }
  return { kept, filtered };
}

/** "Spring Gala" (gala), "Acting Class: Teens" (acting class), and 3 more */
export function describeFiltered(filtered: readonly FilteredCandidate[], max = 5): string {
  // Platforms list one event per performance, so the same title repeats.
  const unique = [...new Map(filtered.map((f) => [`${f.title}\0${f.keyword}`, f])).values()];
  const shown = unique.slice(0, max).map((f) => `"${f.title}" (${f.keyword})`);
  const more = unique.length - shown.length;
  return shown.join(', ') + (more > 0 ? `, and ${more} more` : '');
}
