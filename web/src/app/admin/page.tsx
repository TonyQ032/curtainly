import { requireAdmin } from '@/lib/auth';

export default async function AdminHome() {
  await requireAdmin();
  return (
    <main>
      <h1>Admin</h1>
      <p className="muted">Review queue, registry and coverage arrive in M1–M5.</p>
    </main>
  );
}
