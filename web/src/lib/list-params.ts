/** Query-string handling shared by every admin list page: search + pagination. */

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams = {
  q: string;
  page: number;
  pageSize: number;
  offset: number;
};

export const DEFAULT_PAGE_SIZE = 25;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListParams(sp: SearchParams, pageSize = DEFAULT_PAGE_SIZE): ListParams {
  const q = (first(sp.q) ?? '').trim().slice(0, 200);
  const parsed = Number.parseInt(first(sp.page) ?? '', 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return { q, page, pageSize, offset: (page - 1) * pageSize };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Build a link to the same list with some params changed. Empty values and page 1 are dropped. */
export function listHref(
  pathname: string,
  current: SearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const v = first(value);
    if (v) params.set(key, v);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  if (params.get('page') === '1') params.delete('page');
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
