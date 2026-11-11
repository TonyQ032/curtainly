import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isAdminEmail } from './admin-emails';
import { createClient } from './supabase/server';

/**
 * The authoritative admin check (the proxy is only a fast pre-filter).
 * Call it in every /admin page, Server Action and Route Handler before
 * touching data. Verifies the session with Supabase Auth and the allowlist.
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) redirect('/login');
  return { email: user.email! };
});
