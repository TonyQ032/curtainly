/**
 * Admin allowlist. ADMIN_EMAILS is a comma-separated list of emails allowed into
 * /admin. Fails closed: an unset or empty list means nobody is an admin.
 */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined, raw = process.env.ADMIN_EMAILS) {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}

/** Only allow redirects back into /admin, never to another origin or page. */
export function safeAdminPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('//')) return '/admin';
  return next;
}
