/**
 * Work matching for the review queue: rank existing Works against a candidate
 * title by normalized title and alt titles. See docs/PLAN.md → "Duplicate and
 * identity rules" and DECISIONS.md (2026-11-12, #21).
 *
 * Matching runs in memory over a prebuilt index rather than in Postgres
 * (pg_trgm): the registry holds a few thousand Works at most, and the runner
 * builds the index once per run.
 */
import { normalizeTitle } from './normalize';

/** The Work columns matching needs (a `select` from `works`). */
export type MatchableWork = {
  id: string;
  title: string;
  normalizedTitle: string;
  altTitles: readonly string[];
};

/**
 * How a suggestion matched, strongest first:
 * - `exact`: normalized title is equal
 * - `alt_title`: normalized alt title is equal
 * - `main_title`: equal once a subtitle is dropped ("Hamilton: An American Musical")
 * - `contains`: one title's words appear in the other ("Disney's Beauty and the Beast")
 * - `similar`: trigram similarity only (typos, small wording differences)
 */
export type WorkMatchKind = 'exact' | 'alt_title' | 'main_title' | 'contains' | 'similar';

export type WorkMatch = {
  workId: string;
  /** The Work's display title. */
  title: string;
  /** 0–1; 1 only for an exact title match. */
  score: number;
  kind: WorkMatchKind;
  /** The title or alt title that produced the score. */
  matchedTitle: string;
};

export type SuggestOptions = {
  /** Maximum suggestions returned (default 5). */
  limit?: number;
  /** Suggestions scoring below this are dropped (default 0.3). */
  minScore?: number;
};

const SCORE = {
  exact: 1,
  alt_title: 0.98,
  main_title: 0.9,
  /** `contains` scores between these, by how much of the longer title is covered. */
  containsMin: 0.6,
  containsMax: 0.88,
  /** Trigram-only matches stay below every rule-based match. */
  similarMax: 0.85,
} as const;

const KIND_RANK: Record<WorkMatchKind, number> = {
  exact: 0,
  alt_title: 1,
  main_title: 2,
  contains: 3,
  similar: 4,
};

/** Shortest title (in characters) that can match by containment; shorter ones are too generic. */
const MIN_CONTAINED_LENGTH = 4;

type IndexedName = {
  original: string;
  isAlt: boolean;
  normalized: string;
  main: string;
  words: string[];
  trigrams: Set<string>;
};

type IndexedWork = { work: MatchableWork; names: IndexedName[] };

export type WorkIndex = { readonly works: readonly IndexedWork[] };

/**
 * Trigrams the way pg_trgm builds them: each word padded with two spaces in
 * front and one behind, so word starts weigh more than word ends.
 */
export function trigrams(normalized: string): Set<string> {
  const set = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Jaccard similarity of two trigram sets (pg_trgm's `similarity`). */
export function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** The title before a subtitle separator (":", " - ", "–", "—", "("), normalized. */
function mainTitle(title: string, normalized: string): string {
  const head = title.split(/\s*[:(–—]|\s+-\s+/)[0] ?? '';
  const main = normalizeTitle(head);
  return main || normalized;
}

function indexName(original: string, normalized: string, isAlt: boolean): IndexedName {
  return {
    original,
    isAlt,
    normalized,
    main: mainTitle(original, normalized),
    words: normalized.split(' '),
    trigrams: trigrams(normalized),
  };
}

/** Precompute normalized forms and trigrams for every Work title and alt title. */
export function buildWorkIndex(works: readonly MatchableWork[]): WorkIndex {
  return {
    works: works.map((work) => {
      const names = [indexName(work.title, work.normalizedTitle, false)];
      for (const alt of work.altTitles) {
        const normalized = normalizeTitle(alt);
        if (normalized) names.push(indexName(alt, normalized, true));
      }
      return { work, names };
    }),
  };
}

/** True if `inner`'s words appear as a contiguous run inside `outer`'s words. */
function containsWords(outer: string[], inner: string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false;
  for (let i = 0; i + inner.length <= outer.length; i++) {
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  }
  return false;
}

function scoreName(
  candidate: IndexedName,
  name: IndexedName,
): { score: number; kind: WorkMatchKind } {
  if (candidate.normalized === name.normalized) {
    return name.isAlt
      ? { score: SCORE.alt_title, kind: 'alt_title' }
      : { score: SCORE.exact, kind: 'exact' };
  }
  if (candidate.main === name.normalized || candidate.normalized === name.main) {
    return { score: SCORE.main_title, kind: 'main_title' };
  }

  const similarity = Math.min(
    trigramSimilarity(candidate.trigrams, name.trigrams),
    SCORE.similarMax,
  );

  const [shorter, longer] =
    candidate.words.length <= name.words.length ? [candidate, name] : [name, candidate];
  if (
    shorter.normalized.length >= MIN_CONTAINED_LENGTH &&
    containsWords(longer.words, shorter.words)
  ) {
    const coverage = shorter.words.length / longer.words.length;
    const contains = SCORE.containsMin + (SCORE.containsMax - SCORE.containsMin) * coverage;
    if (contains >= similarity) return { score: contains, kind: 'contains' };
  }

  return { score: similarity, kind: 'similar' };
}

/**
 * Rank Works against a candidate title. Each Work appears once, scored by its
 * best title or alt title. Sorted by score, then match kind, then title.
 */
export function suggestWorks(
  title: string,
  works: WorkIndex | readonly MatchableWork[],
  { limit = 5, minScore = 0.3 }: SuggestOptions = {},
): WorkMatch[] {
  const normalized = normalizeTitle(title);
  if (!normalized) return [];
  const candidate = indexName(title, normalized, false);
  const index = 'works' in works ? works : buildWorkIndex(works);

  const matches: WorkMatch[] = [];
  for (const { work, names } of index.works) {
    let best: WorkMatch | undefined;
    for (const name of names) {
      const { score, kind } = scoreName(candidate, name);
      if (
        !best ||
        score > best.score ||
        (score === best.score && KIND_RANK[kind] < KIND_RANK[best.kind])
      ) {
        best = { workId: work.id, title: work.title, score, kind, matchedTitle: name.original };
      }
    }
    if (best && best.score >= minScore) matches.push(best);
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit)
    .map((m) => ({ ...m, score: Math.round(m.score * 1000) / 1000 }));
}
