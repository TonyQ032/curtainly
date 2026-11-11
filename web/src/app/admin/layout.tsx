import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { logout } from '../login/actions';
import { AdminNav } from './_components/admin-nav';

export const metadata: Metadata = {
  title: { default: 'Admin · Curtainly', template: '%s · Curtainly admin' },
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();

  return (
    <div className="admin">
      <header className="admin-header">
        <Link href="/admin" className="admin-brand">
          Curtainly admin
        </Link>
        <form action={logout} className="admin-user">
          <span className="muted">{email}</span>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <div className="admin-body">
        <AdminNav />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
