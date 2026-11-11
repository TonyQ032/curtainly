'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './nav-items';

export function AdminNav() {
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
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
