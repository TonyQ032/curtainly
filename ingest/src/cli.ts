/**
 * Entry point for the daily GitHub Actions run (`pnpm ingest`).
 * Loads enabled sources (or only INGEST_SOURCE_ID), runs each through its
 * adapter and records health on the Source. Writing candidates to the review
 * queue comes in #23.
 *
 * Exits 0 when individual sources fail: that is recorded as source health.
 * Exits 1 only when the run itself can't proceed (no database, unknown source).
 */
import { existsSync } from 'node:fs';
import { createDb } from '@curtainly/shared/db';
import { adapters } from './adapters';
import { createPoliteFetch } from './polite-fetch';
import { formatSummary, runAll } from './run';
import { dbSourceStore } from './source-store';

// Local runs read the repo-root .env; Actions sets the variables directly.
const rootEnv = new URL('../../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const registered = Object.keys(adapters);
console.log(
  `[ingest] ${registered.length} adapter(s) registered: ${registered.join(', ') || 'none'}`,
);

if (!process.env.DATABASE_URL) {
  console.log('[ingest] DATABASE_URL not set; nothing to do.');
  process.exit(0);
}

const sourceId = process.env.INGEST_SOURCE_ID?.trim() || undefined;
const db = createDb(process.env.DATABASE_URL, { max: 4 });
const started = Date.now();

try {
  const summary = await runAll({
    store: dbSourceStore(db),
    adapters,
    fetch: createPoliteFetch({ log: (m) => console.log(`[fetch] ${m}`) }),
    sourceId,
  });
  console.log(formatSummary(summary, Date.now() - started));
} catch (err) {
  console.error(`[ingest] run failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
