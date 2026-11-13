'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './nav-items';

/** `counts` adds a number after a section's label, keyed by href (e.g. pending review items). */
export function AdminNav({ counts = {} }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="admin-nav" aria-label="Admin">
      {NAV.map((group, i) => (
        <div key={group.label ?? i} className="admin-nav-group">
          {group.label && <span className="admin-nav-label">{group.label}</span>}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={item.issue ? 'pending' : undefined}
            >
              {item.label}
              {counts[item.href] ? (
                <span className="nav-count">
                  {counts[item.href]}
                  <span className="visually-hidden"> pending</span>
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
