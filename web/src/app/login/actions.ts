'use server';

import { redirect } from 'next/navigation';
import { isAdminEmail, safeAdminPath } from '@/lib/admin-emails';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeAdminPath(String(formData.get('next') ?? ''));

  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Same message for wrong credentials and non-admin accounts.
  if (error || !isAdminEmail(data.user?.email)) {
    if (!error) await supabase.auth.signOut();
    return { error: 'Invalid email or password.' };
  }

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
