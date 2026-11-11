import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export { schema };

/**
 * Create a Drizzle client. `prepare: false` keeps it compatible with
 * Supabase's transaction pooler (pgbouncer).
 */
export function createDb(
  url = process.env.DATABASE_URL,
  options: NonNullable<Parameters<typeof postgres>[1]> = {},
) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { prepare: false, ...options });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
