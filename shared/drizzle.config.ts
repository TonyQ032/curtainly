import { defineConfig } from 'drizzle-kit';

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
