/**
 * Entry point for the daily GitHub Actions run (`pnpm ingest`).
 * M2 replaces the stub below with: load enabled sources from the DB, run each
 * through its adapter, dedup against existing productions, write ReviewItems,
 * record source health.
 */
import { adapters } from './adapters';

const registered = Object.keys(adapters);
console.log(
  `[ingest] ${registered.length} adapter(s) registered: ${registered.join(', ') || 'none'}`,
);

if (!process.env.DATABASE_URL) {
  console.log('[ingest] DATABASE_URL not set; nothing to do.');
  process.exit(0);
}

console.log('[ingest] Runner not implemented yet (M2).');
