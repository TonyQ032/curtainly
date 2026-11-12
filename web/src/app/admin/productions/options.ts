import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { companies, regions, venues } from '@curtainly/shared/db/schema';
import { db } from '@/lib/db';
import type { CompanyOption, VenueOption } from './production-form';

/** Companies and venues for the production form's selects, grouped by region. */
export async function loadFormOptions(): Promise<{
  companies: CompanyOption[];
  venues: VenueOption[];
}> {
  const [companyRows, venueRows] = await Promise.all([
    db()
      .select({
        id: companies.id,
        name: companies.name,
        regionName: regions.name,
        inScope: companies.inScope,
        active: companies.active,
      })
      .from(companies)
      .innerJoin(regions, eq(companies.regionId, regions.id))
      .orderBy(asc(regions.name), asc(companies.name)),
    db()
      .select({
        id: venues.id,
        name: venues.name,
        regionName: regions.name,
        timezone: regions.timezone,
      })
      .from(venues)
      .innerJoin(regions, eq(venues.regionId, regions.id))
      .orderBy(asc(regions.name), asc(venues.name)),
  ]);
  return { companies: companyRows, venues: venueRows };
}

/** "25.00" → "25", "42.50" stays. */
export function priceInput(price: string | null): string {
  return price ? price.replace(/\.00$/, '') : '';
}
