/** Admin navigation. `issue` marks sections not built yet (shown as placeholders). */
export type NavItem = { href: string; label: string; issue?: number };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: '/admin', label: 'Overview' }] },
  {
    items: [
      { href: '/admin/review', label: 'Review queue' },
      { href: '/admin/filter-rules', label: 'Filter rules' },
    ],
  },
  {
    label: 'Registry',
    items: [
      { href: '/admin/regions', label: 'Regions' },
      { href: '/admin/companies', label: 'Companies' },
      { href: '/admin/venues', label: 'Venues' },
      { href: '/admin/works', label: 'Works' },
      { href: '/admin/sources', label: 'Sources' },
      { href: '/admin/productions', label: 'Productions' },
    ],
  },
  { items: [{ href: '/admin/coverage', label: 'Coverage', issue: 60 }] },
  { label: 'Settings', items: [{ href: '/admin/theme', label: 'Theme' }] },
];

/** Placeholder sections, keyed by their path segment under /admin. */
export const PLACEHOLDERS = new Map(
  NAV.flatMap((g) => g.items)
    .filter((i) => i.issue)
    .map((i) => [i.href.replace('/admin/', ''), i] as const),
);
