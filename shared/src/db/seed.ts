/**
 * Seed reference data. Safe to rerun: existing rows (matched by slug) are left alone.
 * Usage: pnpm db:seed   (reads DATABASE_URL from the repo-root .env)
 *
 * The San Diego company registry (#16) will be added here.
 */
import { existsSync } from 'node:fs';
import { createDb } from './index';
import { regions } from './schema';

const rootEnv = new URL('../../../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const db = createDb();

const seededRegions = await db
  .insert(regions)
  .values([
    {
      name: 'San Diego County',
      slug: 'sd',
      timezone: 'America/Los_Angeles',
      // Approximate center of the county's populated area (lon, lat); 45 mi reaches
      // Oceanside, Escondido, Ramona and the border. Refine when the region goes live.
      center: { x: -117.0, y: 32.95 },
      radiusMiles: 45,
      status: 'building',
    },
  ])
  .onConflictDoNothing({ target: regions.slug })
  .returning({ slug: regions.slug });

console.log(
  `[seed] regions inserted: ${seededRegions.map((r) => r.slug).join(', ') || 'none (already present)'}`,
);

await db.$client.end();
