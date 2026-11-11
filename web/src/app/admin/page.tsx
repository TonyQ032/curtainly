import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { NAV } from './_components/nav-items';
import { PageHeader } from './_components/page-header';

export default async function AdminHome() {
  await requireAdmin();
  const sections = NAV.flatMap((g) => g.items).filter((i) => i.href !== '/admin');

  return (
    <>
      <PageHeader
        title="Overview"
        description="Keep the registry complete and the listings correct."
      />
      <ul className="section-list">
        {sections.map((s) => (
          <li key={s.href}>
            <Link href={s.href}>{s.label}</Link>
            {s.issue && <span className="badge">Planned · #{s.issue}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
