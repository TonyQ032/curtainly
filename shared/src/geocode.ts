/**
 * Address → coordinates via the public Nominatim API (OpenStreetMap).
 * Policy: https://operations.osmfoundation.org/policies/nominatim/
 * - at most 1 request per second (enforced here per process)
 * - identifying User-Agent (INGEST_USER_AGENT, else DEFAULT_USER_AGENT), never a stock one
 * - store results; only look an address up again when it changes
 * - show "© OpenStreetMap contributors" where coordinates are used
 * - must be switchable off without a deploy: set GEOCODER=off
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const OSM_ATTRIBUTION = 'Geocoding © OpenStreetMap contributors (ODbL)';
export const MIN_INTERVAL_MS = 1100;
/** Used when INGEST_USER_AGENT isn't set. Identifies the app with a contact URL, as the policy asks. */
export const DEFAULT_USER_AGENT = 'CurtainlyBot/0.1 (+https://github.com/TonyQ032/curtainly)';

export type GeocodeResult =
  | { ok: true; lat: number; lng: number; displayName: string }
  | { ok: false; reason: 'disabled' | 'not_found' | 'error'; message: string };

export type GeocodeOptions = {
  userAgent?: string;
  /** ISO country codes to restrict results to. */
  countryCodes?: string[];
  fetch?: typeof fetch;
  /** For tests: skip the rate-limit wait. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

let nextAllowedAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Serialize calls and space them MIN_INTERVAL_MS apart. */
function throttled<T>(
  task: () => Promise<T>,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
) {
  const run = queue.then(async () => {
    const wait = nextAllowedAt - now();
    if (wait > 0) await sleep(wait);
    nextAllowedAt = now() + MIN_INTERVAL_MS;
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

export function geocoderEnabled(env: Record<string, string | undefined> = process.env) {
  return (env.GEOCODER ?? 'nominatim').toLowerCase() !== 'off';
}

export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {},
): Promise<GeocodeResult> {
  if (!geocoderEnabled()) {
    return { ok: false, reason: 'disabled', message: 'Geocoding is switched off (GEOCODER=off).' };
  }
  const userAgent = options.userAgent || process.env.INGEST_USER_AGENT || DEFAULT_USER_AGENT;
  const query = address.trim();
  if (!query) return { ok: false, reason: 'not_found', message: 'No address to look up.' };

  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
  if (options.countryCodes?.length) params.set('countrycodes', options.countryCodes.join(','));

  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  try {
    const res = await throttled(
      () =>
        doFetch(`${NOMINATIM_URL}?${params}`, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        }),
      now,
      sleep,
    );
    if (!res.ok)
      return { ok: false, reason: 'error', message: `Nominatim returned HTTP ${res.status}.` };
    const body = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const hit = body[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, reason: 'not_found', message: 'No match for this address.' };
    }
    return { ok: true, lat, lng, displayName: hit.display_name ?? '' };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** For tests only. */
export function resetGeocodeThrottle() {
  nextAllowedAt = 0;
  queue = Promise.resolve();
}
