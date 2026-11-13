import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { count, eq } from 'drizzle-orm';
import { reviewItems } from '@curtainly/shared/db/schema';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { logout } from '../login/actions';
import { AdminNav } from './_components/admin-nav';

export const metadata: Metadata = {
  title: { default: 'Admin · Curtainly', template: '%s · Curtainly admin' },
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  // Layouts persist across client navigation, so this refreshes on a full load or when an
  // action revalidates the admin layout (review actions should: revalidatePath('/admin', 'layout')).
  const [pending] = await db()
    .select({ n: count() })
    .from(reviewItems)
    .where(eq(reviewItems.status, 'pending'));

  return (
    <div className="admin">
      <div className="curtain-band" />
      <header className="admin-header">
        <Link href="/admin" className="admin-brand">
          Curtainly admin
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <form action={logout} className="admin-user">
            <span className="muted">{email}</span>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <div className="admin-body">
        <AdminNav counts={{ '/admin/review': pending?.n ?? 0 }} />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
