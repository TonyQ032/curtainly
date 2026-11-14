/**
 * Non-show event filter rules (#26). A rule is a keyword or phrase; a
 * candidate whose title contains it as whole words is not a show (a gala, a
 * class, a camp…) and is counted but never queued. Rules are global or belong
 * to one source.
 */

export interface FilterRule {
  id: string;
  /** Null for a global rule. */
  sourceId: string | null;
  /** Stored normalized (see `normalizeKeyword`). */
  keyword: string;
}

/**
 * Lowercase words separated by single spaces: diacritics stripped, `&` read
 * as "and", apostrophes dropped, other punctuation a word break. Unlike
 * `normalizeTitle`, nothing is removed, so "The Gala" keeps its article.
 */
export function normalizeKeyword(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Whether the title contains the (normalized) keyword as whole words. */
export function titleHasKeyword(title: string, keyword: string): boolean {
  if (!keyword) return false;
  return ` ${normalizeKeyword(title)} `.includes(` ${keyword} `);
}

/** The first rule that applies to this source and matches the title. */
export function findFilterRule(
  title: string,
  sourceId: string,
  rules: readonly FilterRule[],
): FilterRule | undefined {
  const text = ` ${normalizeKeyword(title)} `;
  return rules.find(
    (r) =>
      r.keyword &&
      (r.sourceId === null || r.sourceId === sourceId) &&
      text.includes(` ${r.keyword} `),
  );
}

/**
 * Words that usually mark a listing as something other than a show. Used to
 * suggest a keyword when a reviewer marks an item "not a show".
 */
const NON_SHOW_WORDS = [
  'gala',
  'fundraiser',
  'benefit',
  'auditions',
  'audition',
  'class',
  'classes',
  'masterclass',
  'workshop',
  'workshops',
  'camp',
  'camps',
  'conservatory',
  'lesson',
  'lessons',
  'reading',
  'improv',
  'open mic',
  'parking',
  'gift card',
  'gift certificate',
  'subscription',
  'membership',
  'donation',
  'tour',
  'party',
  'dinner',
  'brunch',
  'trivia',
];

/** A keyword from the title worth proposing as a rule, or '' when none stands out. */
export function suggestKeyword(title: string): string {
  return NON_SHOW_WORDS.find((w) => titleHasKeyword(title, w)) ?? '';
}
