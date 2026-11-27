/**
 * Entry point for the daily archive step (`pnpm archive`), run after ingest in
 * the same GitHub Actions job. Archives published productions whose end date
 * has passed in their Region's timezone (#28).
 *
 * Exits 1 when the run can't proceed or any Region fails, so the workflow shows it.
 */
import { existsSync } from 'node:fs';
import { createDb } from '@curtainly/shared/db';
import { archiveEnded, formatArchiveSummary } from './archive';
import { dbArchiveStore } from './archive-store';

// Local runs read the repo-root .env; Actions sets the variables directly.
const rootEnv = new URL('../../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

if (!process.env.DATABASE_URL) {
  console.log('[archive] DATABASE_URL not set; nothing to do.');
  process.exit(0);
}

const db = createDb(process.env.DATABASE_URL, { max: 1 });

try {
  const summary = await archiveEnded({ store: dbArchiveStore(db) });
  console.log(formatArchiveSummary(summary));
  if (summary.failed > 0) process.exitCode = 1;
} catch (err) {
  console.error(`[archive] run failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
