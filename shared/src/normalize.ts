/**
 * Title normalization used before fuzzy-matching candidate titles against Works.
 * See docs/PLAN.md → "Duplicate and identity rules".
 */

/** Suffixes that describe an edition of a work rather than a different work. */
const EDITION_SUFFIXES = [
  'the musical',
  'a new musical',
  'the play',
  'youth edition',
  'school edition',
  'teen edition',
  'jr',
  'junior',
  'kids',
];

export function normalizeTitle(title: string): string {
  let t = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // drop apostrophes without splitting words
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  // Drop edition suffixes, repeatedly ("... the musical jr").
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of EDITION_SUFFIXES) {
      if (t !== suffix && t.endsWith(` ${suffix}`)) {
        t = t.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }

  // Leading article.
  t = t.replace(/^(the|a|an) (?=\S)/, '');

  return t.replace(/\s+/g, ' ').trim();
}
