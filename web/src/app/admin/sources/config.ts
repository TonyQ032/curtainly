import type { SourceKind } from '@curtainly/shared';
import { z } from 'zod';

/**
 * Per-kind validation of `sources.config`. Each ingest adapter reads exactly
 * these keys; unknown keys are rejected so typos don't silently do nothing.
 * Adding an adapter in M3 means adding its schema and example here.
 */

const pageUrl = z
  .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
  .max(500, 'Keep URLs under 500 characters');
const trimmed = (label: string) => z.string().trim().min(1, `${label} is required`).max(200);

export const SOURCE_CONFIG_SCHEMAS = {
  ticketmaster: z.strictObject({
    venueIds: z.array(trimmed('Venue ID')).min(1, 'List at least one Ticketmaster venue ID'),
  }),
  ovationtix: z.strictObject({
    clientId: z.coerce.number().int().positive('Client ID must be a positive number'),
  }),
  arts_people: z.strictObject({ url: pageUrl }),
  thundertix: z.strictObject({ url: pageUrl }),
  vbo: z.strictObject({ url: pageUrl }),
  jsonld: z.strictObject({ url: pageUrl }),
  custom: z.strictObject({ adapter: trimmed('Adapter name'), url: pageUrl }),
  manual: z.strictObject({}),
  submission: z.strictObject({}),
} satisfies Record<SourceKind, z.ZodType>;

/** Shown as the placeholder and starting value for each kind's config. */
export const SOURCE_CONFIG_EXAMPLES: Record<SourceKind, Record<string, unknown>> = {
  ticketmaster: { venueIds: ['KovZpZAEkn6A'] },
  ovationtix: { clientId: 36001 },
  arts_people: { url: 'https://www.artspeople.com/org/events' },
  thundertix: { url: 'https://example.thundertix.com/events' },
  vbo: { url: 'https://www.vbotickets.com/promoter/12345' },
  jsonld: { url: 'https://example.org/shows' },
  custom: { adapter: 'old-globe', url: 'https://www.theoldglobe.org/' },
  manual: {},
  submission: {},
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  ticketmaster: 'Ticketmaster',
  ovationtix: 'OvationTix',
  arts_people: 'Arts People',
  thundertix: 'ThunderTix',
  vbo: 'VBO Tickets',
  jsonld: 'Generic JSON-LD',
  custom: 'Custom scraper',
  manual: 'Manual entry',
  submission: 'Public submission',
};

export type ConfigResult =
  { ok: true; config: Record<string, unknown> } | { ok: false; errors: string[] };

/** Parse the JSON text from the form and validate it for `kind`. Blank means `{}`. */
export function parseSourceConfig(kind: SourceKind, text: string): ConfigResult {
  let json: unknown;
  try {
    json = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Config must be valid JSON'] };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    return { ok: false, errors: ['Config must be a JSON object'] };

  const result = SOURCE_CONFIG_SCHEMAS[kind].safeParse(json);
  if (result.success) return { ok: true, config: result.data as Record<string, unknown> };
  return {
    ok: false,
    errors: result.error.issues.map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    }),
  };
}
