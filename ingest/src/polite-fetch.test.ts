import { describe, expect, it } from 'vitest';
import { RobotsDisallowedError, createPoliteFetch, parseRetryAfter } from './polite-fetch';

type FetchInput = Parameters<typeof fetch>[0];
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A fake network with a fake clock: sleep advances time instantly. */
function setup(handler: Handler, robots: Record<string, Response | (() => Response)> = {}) {
  let t = 0;
  const calls: { url: string; at: number; userAgent: string | null }[] = [];
  const logs: string[] = [];
  const fakeFetch = (async (input: FetchInput, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, at: t, userAgent: new Headers(init.headers).get('user-agent') });
    const { origin, pathname } = new URL(url);
    if (pathname === '/robots.txt') {
      const r = robots[origin];
      if (!r) return new Response('not found', { status: 404 });
      return typeof r === 'function' ? r() : r.clone();
    }
    return handler(url, init);
  }) as typeof fetch;
  const politeFetch = createPoliteFetch({
    userAgent: 'CurtainlyBot/0.1 (+https://example.org)',
    fetch: fakeFetch,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    log: (m) => logs.push(m),
  });
  const pageCalls = () => calls.filter((c) => !c.url.endsWith('/robots.txt'));
  return { politeFetch, calls, pageCalls, logs, time: () => t };
}

const ok = (body = 'ok') => new Response(body, { status: 200 });

describe('createPoliteFetch', () => {
  it('identifies with the user agent on every request, robots.txt included', async () => {
    const { politeFetch, calls } = setup(() => ok());
    await politeFetch('https://a.test/shows', { headers: { Accept: 'text/html' } });
    expect(calls.map((c) => c.userAgent)).toEqual([
      'CurtainlyBot/0.1 (+https://example.org)',
      'CurtainlyBot/0.1 (+https://example.org)',
    ]);
  });

  describe('robots.txt', () => {
    it('fetches it once per origin and refuses disallowed paths', async () => {
      const { politeFetch, calls } = setup(() => ok(), {
        'https://a.test': new Response('User-agent: *\nDisallow: /private\n'),
      });
      await politeFetch('https://a.test/shows');
      await expect(politeFetch('https://a.test/private/x')).rejects.toBeInstanceOf(
        RobotsDisallowedError,
      );
      await politeFetch('https://a.test/other');
      expect(calls.filter((c) => c.url.endsWith('/robots.txt'))).toHaveLength(1);
      expect(calls.some((c) => c.url.includes('/private'))).toBe(false);
    });

    it('allows everything when robots.txt is missing', async () => {
      const { politeFetch } = setup(() => ok());
      const res = await politeFetch('https://a.test/anything');
      expect(await res.text()).toBe('ok');
    });

    it('treats a server error on robots.txt as disallow-all', async () => {
      const { politeFetch, logs } = setup(() => ok(), {
        'https://a.test': () => new Response('down', { status: 503 }),
      });
      await expect(politeFetch('https://a.test/shows')).rejects.toBeInstanceOf(
        RobotsDisallowedError,
      );
      expect(logs.some((l) => l.includes('treating host as disallowed'))).toBe(true);
    });

    it('raises the per-host delay to Crawl-delay', async () => {
      const { politeFetch, pageCalls } = setup(() => ok(), {
        'https://a.test': new Response('User-agent: *\nCrawl-delay: 5\n'),
      });
      await politeFetch('https://a.test/1');
      await politeFetch('https://a.test/2');
      const [first, second] = pageCalls();
      expect(second!.at - first!.at).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('per-host limits', () => {
    it('spaces requests to one host by the minimum delay', async () => {
      const { politeFetch, pageCalls } = setup(() => ok());
      await Promise.all([1, 2, 3].map((n) => politeFetch(`https://a.test/${n}`)));
      const starts = pageCalls().map((c) => c.at);
      expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
      expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000);
    });

    it('runs one request per host at a time', async () => {
      let active = 0;
      let maxActive = 0;
      const { politeFetch } = setup(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return ok();
      });
      await Promise.all([1, 2, 3].map((n) => politeFetch(`https://a.test/${n}`)));
      expect(maxActive).toBe(1);
    });

    it("doesn't make one host wait on another", async () => {
      const { politeFetch, pageCalls } = setup(() => ok());
      await Promise.all([
        ...[1, 2, 3].map((n) => politeFetch(`https://a.test/${n}`)),
        politeFetch('https://b.test/1'),
      ]);
      const order = pageCalls().map((c) => c.url);
      expect(order.indexOf('https://b.test/1')).toBeLessThan(order.indexOf('https://a.test/3'));
    });
  });

  describe('retries', () => {
    it('retries 5xx with backoff, then succeeds', async () => {
      let n = 0;
      const { politeFetch, pageCalls } = setup(() =>
        ++n < 3 ? new Response('busy', { status: 503 }) : ok('done'),
      );
      const res = await politeFetch('https://a.test/shows');
      expect(await res.text()).toBe('done');
      expect(pageCalls()).toHaveLength(3);
    });

    it('honours Retry-After on 429', async () => {
      let n = 0;
      const { politeFetch, pageCalls } = setup(() =>
        ++n === 1
          ? new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } })
          : ok(),
      );
      await politeFetch('https://a.test/shows');
      const [first, second] = pageCalls();
      expect(second!.at - first!.at).toBeGreaterThanOrEqual(7000);
    });

    it('gives up after the retry limit and returns the last response', async () => {
      const { politeFetch, pageCalls } = setup(() => new Response('down', { status: 500 }));
      const res = await politeFetch('https://a.test/shows');
      expect(res.status).toBe(500);
      expect(pageCalls()).toHaveLength(3);
    });

    it("doesn't retry 404", async () => {
      const { politeFetch, pageCalls } = setup(() => new Response('gone', { status: 404 }));
      expect((await politeFetch('https://a.test/shows')).status).toBe(404);
      expect(pageCalls()).toHaveLength(1);
    });

    it('retries network errors and rethrows the last one', async () => {
      const { politeFetch, pageCalls } = setup(() => {
        throw new TypeError('fetch failed');
      });
      await expect(politeFetch('https://a.test/shows')).rejects.toThrow('fetch failed');
      expect(pageCalls()).toHaveLength(3);
    });

    it("doesn't retry POST", async () => {
      const { politeFetch, pageCalls } = setup(() => new Response('down', { status: 503 }));
      await politeFetch('https://a.test/api', { method: 'POST', body: '{}' });
      expect(pageCalls()).toHaveLength(1);
    });
  });

  describe('run cache', () => {
    it('serves repeat GETs from the cache, with a readable body each time', async () => {
      const { politeFetch, pageCalls } = setup((url) =>
        Response.json({ url }, { headers: { 'X-Test': '1' } }),
      );
      const a = await politeFetch('https://a.test/shows');
      const b = await politeFetch('https://a.test/shows');
      expect(await a.json()).toEqual({ url: 'https://a.test/shows' });
      expect(await b.json()).toEqual({ url: 'https://a.test/shows' });
      expect(b.headers.get('x-test')).toBe('1');
      expect(pageCalls()).toHaveLength(1);
    });

    it('shares one request between concurrent identical GETs', async () => {
      const { politeFetch, pageCalls } = setup(() => ok());
      await Promise.all([politeFetch('https://a.test/x'), politeFetch('https://a.test/x')]);
      expect(pageCalls()).toHaveLength(1);
    });

    it("doesn't cache errors or non-GET requests", async () => {
      const { politeFetch, pageCalls } = setup(() => new Response('gone', { status: 404 }));
      await politeFetch('https://a.test/missing');
      await politeFetch('https://a.test/missing');
      await politeFetch('https://a.test/api', { method: 'POST' });
      await politeFetch('https://a.test/api', { method: 'POST' });
      expect(pageCalls()).toHaveLength(4);
    });
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('3', 0)).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000);
    expect(parseRetryAfter('soon', 0)).toBeUndefined();
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });
});
