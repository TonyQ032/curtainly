'use server';

import { slugify } from '@curtainly/shared';
import { regions, venues } from '@curtainly/shared/db/schema';
import { geocodeAddress } from '@curtainly/shared/geocode';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fieldError, isUniqueViolation } from '@/lib/form-errors';
import { parseForm, type FormState } from '@/lib/forms';
import { distanceMiles } from '@/lib/geo';
import { generateSlug, isSlugInUse } from '@/lib/slugs';
import { planLocation, venueFormSchema, type LocationPlan, type VenueFormInput } from './schema';

const SLUG_TAKEN = { slug: ['Another venue already uses this slug'] };

/** Why a saved venue has no (or a suspicious) location, shown on the list after redirect. */
export type GeoNotice = 'not_found' | 'error' | 'disabled' | 'outside';

type Region = typeof regions.$inferSelect;
type Point = { x: number; y: number };

async function loadRegion(id: string): Promise<Region | undefined> {
  const [region] = await db().select().from(regions).where(eq(regions.id, id)).limit(1);
  return region;
}

/** Turn a location plan into a point (or null) plus an optional notice. */
async function resolveLocation(
  plan: LocationPlan,
  input: VenueFormInput,
  region: Region,
): Promise<{ location?: Point | null; notice?: GeoNotice }> {
  if (plan.kind === 'keep') return {};
  let point: Point | null;
  if (plan.kind === 'manual') {
    point = { x: plan.lng, y: plan.lat };
  } else {
    const result = await geocodeAddress(input.address, { countryCodes: ['us'] });
    if (!result.ok) return { location: null, notice: result.reason };
    point = { x: result.lng, y: result.lat };
  }
  // Flag matches outside the region: usually a wrong geocode or a typo in typed coordinates.
  const miles = distanceMiles(
    { lat: point.y, lng: point.x },
    { lat: region.center.y, lng: region.center.x },
  );
  return { location: point, notice: miles > region.radiusMiles ? 'outside' : undefined };
}

function done(slug: string, notice?: GeoNotice): never {
  revalidatePath('/admin/venues');
  const params = new URLSearchParams({ saved: slug });
  if (notice) params.set('geo', notice);
  redirect(`/admin/venues?${params}`);
}

export async function createVenue(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(venueFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;
  const region = await loadRegion(input.regionId);
  if (!region) return fieldError(formData, { regionId: ['Pick a region'] });

  let slug = input.slug;
  if (slug) {
    if (await isSlugInUse(venues, slug)) return fieldError(formData, SLUG_TAKEN);
  } else {
    slug = await generateSlug(venues, input.name, 'venue');
  }

  const { location, notice } = await resolveLocation(planLocation(input), input, region);
  try {
    await db()
      .insert(venues)
      .values({
        name: input.name,
        slug,
        address: input.address,
        regionId: region.id,
        website: input.website,
        location: location ?? null,
      });
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug, notice);
}

export async function updateVenue(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(venueFormSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = parsed.data;
  const region = await loadRegion(input.regionId);
  if (!region) return fieldError(formData, { regionId: ['Pick a region'] });

  const [previous] = await db().select().from(venues).where(eq(venues.id, id)).limit(1);
  if (!previous) return { status: 'error', message: 'This venue no longer exists.' };

  const slug = input.slug || slugify(input.name);
  if (!slug) return fieldError(formData, { slug: ['Slug is required'] });
  if (await isSlugInUse(venues, slug, id)) return fieldError(formData, SLUG_TAKEN);

  const plan = planLocation(input, {
    address: previous.address,
    location: previous.location ? { lat: previous.location.y, lng: previous.location.x } : null,
  });
  const { location, notice } = await resolveLocation(plan, input, region);

  try {
    await db()
      .update(venues)
      .set({
        name: input.name,
        slug,
        address: input.address,
        regionId: region.id,
        website: input.website,
        ...(location !== undefined ? { location } : {}),
      })
      .where(eq(venues.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) return fieldError(formData, SLUG_TAKEN);
    throw err;
  }
  done(slug, notice);
}
