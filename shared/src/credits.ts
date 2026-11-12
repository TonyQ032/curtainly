import type { WorkAuthors } from './db/schema';

/** The standard author credits on a Work, in display order. Anything else goes in `other`. */
export const CREDIT_ROLES = ['playwright', 'book', 'music', 'lyrics'] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export const CREDIT_ROLE_LABELS: Record<CreditRole, string> = {
  playwright: 'Playwright',
  book: 'Book',
  music: 'Music',
  lyrics: 'Lyrics',
};

/**
 * Credits as display lines, merging roles held by the same people:
 * { music: [S], lyrics: [S], book: [L] } → ["Book: L", "Music & lyrics: S"].
 */
export function creditLines(authors: WorkAuthors | null | undefined): string[] {
  if (!authors) return [];
  const groups: { roles: string[]; names: string[] }[] = [];
  const add = (role: string, names: string[] | undefined) => {
    if (!names?.length) return;
    const key = names.join('\u0000');
    const group = groups.find((g) => g.names.join('\u0000') === key);
    if (group) group.roles.push(role);
    else groups.push({ roles: [role], names });
  };
  for (const role of CREDIT_ROLES) add(CREDIT_ROLE_LABELS[role], authors[role]);
  for (const o of authors.other ?? []) add(o.role, o.names);

  return groups.map(({ roles, names }) => {
    const label = roles
      .map((r, i) => (i === 0 ? r : r.toLowerCase()))
      .join(roles.length > 2 ? ', ' : ' & ')
      .replace(/, ([^,]+)$/, ' & $1');
    return `${label}: ${names.join(', ')}`;
  });
}
