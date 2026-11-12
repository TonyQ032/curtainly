import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_AGENT,
  MIN_INTERVAL_MS,
  geocodeAddress,
  geocoderEnabled,
  resetGeocodeThrottle,
} from './geocode';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('geocodeAddress', () => {
  beforeEach(() => resetGeocodeThrottle());
  afterEach(() => vi.unstubAllEnvs());

  const ua = 'CurtainlyBot/test (+https://example.org)';

  it('returns coordinates and sends the required parameters and user agent', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([{ lat: '32.7323', lon: '-117.1501', display_name: 'Old Globe' }]),
    );
    const result = await geocodeAddress('1363 Old Globe Way, San Diego, CA', {
      userAgent: ua,
      countryCodes: ['us'],
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, lat: 32.7323, lng: -117.1501, displayName: 'Old Globe' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(params.get('format')).toBe('jsonv2');
    expect(params.get('limit')).toBe('1');
    expect(params.get('countrycodes')).toBe('us');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(ua);
  });

  it('reports no match', async () => {
    const result = await geocodeAddress('nowhere', {
      userAgent: ua,
      fetch: (async () => jsonResponse([])) as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('reports HTTP and network errors without throwing', async () => {
    const http = await geocodeAddress('x', {
      userAgent: ua,
      fetch: (async () => jsonResponse({}, 503)) as typeof fetch,
    });
    expect(http).toMatchObject({
      ok: false,
      reason: 'error',
      message: 'Nominatim returned HTTP 503.',
    });
    const net = await geocodeAddress('x', {
      userAgent: ua,
      fetch: (async () => {
        throw new Error('offline');
      }) as typeof fetch,
    });
    expect(net).toMatchObject({ ok: false, reason: 'error', message: 'offline' });
  });

  it('falls back to the default identifying user agent', async () => {
    vi.stubEnv('INGEST_USER_AGENT', '');
    const fetchMock = vi.fn(async () => jsonResponse([]));
    await geocodeAddress('x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('can be switched off with GEOCODER=off', async () => {
    vi.stubEnv('GEOCODER', 'off');
    expect(geocoderEnabled()).toBe(false);
    const fetchMock = vi.fn();
    const result = await geocodeAddress('x', {
      userAgent: ua,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('spaces consecutive requests at least MIN_INTERVAL_MS apart', async () => {
    let clock = 1_000;
    const sleeps: number[] = [];
    const opts = {
      userAgent: ua,
      fetch: (async () => jsonResponse([{ lat: '1', lon: '2' }])) as typeof fetch,
      now: () => clock,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
    };
    await Promise.all([
      geocodeAddress('a', opts),
      geocodeAddress('b', opts),
      geocodeAddress('c', opts),
    ]);
    expect(sleeps).toEqual([MIN_INTERVAL_MS, MIN_INTERVAL_MS]);
  });
});
