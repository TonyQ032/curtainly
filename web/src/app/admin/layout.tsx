import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { logout } from '../login/actions';

export const metadata: Metadata = {
  title: 'Admin · Curtainly',
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();

  return (
    <div className="container">
      <header className="admin-header">
        <strong>Curtainly admin</strong>
        <form action={logout} className="admin-user">
          <span className="muted">{email}</span>
          <button type="submit">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
