import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Load DATABASE_URL from the repo-root .env when running locally (CI sets it directly).
const rootEnv = new URL('../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // PostGIS creates its own tables/schemas; keep drizzle-kit focused on ours.
  extensionsFilters: ['postgis'],
});
