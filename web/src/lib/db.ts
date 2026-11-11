import 'server-only';
import { createDb, type Db } from '@curtainly/shared/db';

const globalForDb = globalThis as unknown as { curtainlyDb?: Db };

/**
 * Shared Drizzle client for server code. Created lazily (so builds don't need
 * DATABASE_URL) and reused across hot reloads and requests. On Vercel,
 * DATABASE_URL is Supabase's transaction pooler (port 6543).
 */
export function db(): Db {
  globalForDb.curtainlyDb ??= createDb(undefined, { max: 5 });
  return globalForDb.curtainlyDb;
}
