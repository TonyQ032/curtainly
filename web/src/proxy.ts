import { NextResponse, type NextRequest } from 'next/server';
import { isAdminEmail } from './lib/admin-emails';
import { updateSession } from './lib/supabase/proxy';

/**
 * Optimistic auth for /admin: refreshes the session cookie and redirects
 * non-admins to /login. Pages and actions still call requireAdmin().
 */
export async function proxy(request: NextRequest) {
  const { response, email } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const admin = isAdminEmail(email);

  if (pathname.startsWith('/admin') && !admin) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return redirectWithCookies(login, response);
  }

  if (pathname === '/login' && admin) {
    return redirectWithCookies(new URL('/admin', request.url), response);
  }

  return response;
}

/** Keep any refreshed session cookies when redirecting. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
