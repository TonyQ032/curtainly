/**
 * URL slugs for regions, companies, venues, works and productions.
 * See docs/PLAN.md → SEO (e.g. /sd/productions/into-the-woods-lamplighters-2027).
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

export function slugify(text: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // "Lamb's" → "lambs"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  // Cut at a word boundary where possible.
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Production slugs: work-company-year, e.g. into-the-woods-lamplighters-2027. */
export function productionSlug(workTitle: string, companyName: string, year: number): string {
  return slugify(`${workTitle} ${companyName} ${year}`);
}

/**
 * First free slug: `base`, then `base-2`, `base-3`…
 * `taken` holds the slugs already in use (callers query those starting with base).
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
