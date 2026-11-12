import { isValidSlug } from '@curtainly/shared';
import { z } from 'zod';

/** Reusable zod fields for admin forms. */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string) => UUID_PATTERN.test(id);

/** "oldglobe.org" → "https://oldglobe.org"; blank → null. */
export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Optional http(s) URL; https:// is added when left off, blank → null. */
export const urlField = (message: string) =>
  z
    .string()
    .transform(normalizeWebsite)
    .refine((url) => {
      if (url === null) return true;
      if (url.length > 2000) return false;
      try {
        const u = new URL(url);
        return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
      } catch {
        return false;
      }
    }, message);

export const websiteField = urlField('Enter a website like oldglobe.org');

/** Optional on create (generated from the name). */
export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((s) => s === '' || isValidSlug(s), 'Lowercase letters, numbers and single hyphens only');

export const idField = (message: string) => z.string().regex(UUID_PATTERN, message);
