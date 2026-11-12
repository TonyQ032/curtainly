/**
 * Seed reference data. Safe to rerun: existing rows (matched by slug) are left alone.
 * Usage: pnpm db:seed   (reads DATABASE_URL from the repo-root .env)
 *
 * Companies come from seed-data/san-diego-companies.ts (#16).
 */
import { existsSync } from 'node:fs';
import { createDb } from './index';
import { eq } from 'drizzle-orm';
import { slugify } from '../slug';
import { companies, regions } from './schema';
import { SAN_DIEGO_COMPANIES, seedNotes } from './seed-data/san-diego-companies';

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

const [sd] = await db.select({ id: regions.id }).from(regions).where(eq(regions.slug, 'sd'));
if (!sd) throw new Error('[seed] region "sd" missing');

const seededCompanies = await db
  .insert(companies)
  .values(
    SAN_DIEGO_COMPANIES.map((c) => ({
      name: c.name,
      slug: slugify(c.name),
      tier: c.tier,
      regionId: sd.id,
      website: c.website,
      active: c.active,
      inScope: c.inScope,
      notes: seedNotes(c),
    })),
  )
  .onConflictDoNothing({ target: companies.slug })
  .returning({ slug: companies.slug });

console.log(
  `[seed] companies inserted: ${seededCompanies.length} of ${SAN_DIEGO_COMPANIES.length} (others already present)`,
);

await db.$client.end();
