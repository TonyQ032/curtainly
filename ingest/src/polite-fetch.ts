/**
 * The `fetch` handed to adapters (AdapterContext.fetch). One instance per run:
 * - identifies with INGEST_USER_AGENT (fallback: the shared default)
 * - honours robots.txt, fetched once per origin and cached for the run
 * - limits concurrency and spaces request starts per host (raised to the
 *   site's Crawl-delay when it asks for more)
 * - retries network errors, 429 and 5xx with exponential backoff and Retry-After
 * - caches successful GET responses for the rest of the run
 *
 * Redirects are followed by the underlying fetch; robots.txt is checked for the
 * URL the adapter asked for, not for redirect targets.
 */
import { DEFAULT_USER_AGENT } from '@curtainly/shared/geocode';
import {
  ALLOW_ALL,
  DISALLOW_ALL,
  crawlDelayMs,
  isAllowed,
  parseRobots,
  productToken,
  type Robots,
} from './robots';

export class RobotsDisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export interface PoliteFetchOptions {
  userAgent?: string;
  /** Requests in flight per host. Default 1. */
  concurrencyPerHost?: number;
  /** Minimum gap between request starts on one host. Default 1000 ms. */
  minDelayMs?: number;
  /** Upper bound on a site's Crawl-delay, so one site can't stall the run. Default 30 s. */
  maxCrawlDelayMs?: number;
  /** Retries after the first attempt for GET/HEAD. Default 2. */
  retries?: number;
  /** First backoff; doubles per retry. Default 2000 ms. */
  backoffMs?: number;
  /** Longest Retry-After we'll wait. Default 60 s. */
  maxRetryAfterMs?: number;
  /** Per-request timeout when the caller passes no signal. Default 20 s. */
  timeoutMs?: number;
  log?: (message: string) => void;
  /** For tests. */
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface HostState {
  active: number;
  waiters: (() => void)[];
  nextStartAt: number;
  delayMs: number;
}

interface Snapshot {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer;
  url: string;
}

type FetchInput = Parameters<typeof fetch>[0];

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

/** Retry-After as seconds or an HTTP date → milliseconds from now. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function toResponse(snap: Snapshot): Response {
  const res = new Response(NULL_BODY_STATUSES.has(snap.status) ? null : snap.body.slice(0), {
    status: snap.status,
    statusText: snap.statusText,
    headers: snap.headers,
  });
  Object.defineProperty(res, 'url', { value: snap.url });
  return res;
}

export function createPoliteFetch(options: PoliteFetchOptions = {}): typeof fetch {
  const userAgent = options.userAgent || process.env.INGEST_USER_AGENT || DEFAULT_USER_AGENT;
  const token = productToken(userAgent);
  const concurrency = Math.max(1, options.concurrencyPerHost ?? 1);
  const minDelayMs = options.minDelayMs ?? 1000;
  const maxCrawlDelayMs = options.maxCrawlDelayMs ?? 30_000;
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 2000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const log = options.log ?? (() => {});
  const baseFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const hosts = new Map<string, HostState>();
  const robotsByOrigin = new Map<string, Promise<Robots>>();
  const cache = new Map<string, Promise<Snapshot>>();

  function hostState(host: string): HostState {
    let state = hosts.get(host);
    if (!state) {
      state = { active: 0, waiters: [], nextStartAt: 0, delayMs: minDelayMs };
      hosts.set(host, state);
    }
    return state;
  }

  /** Run `task` within the host's concurrency limit, after its spacing delay. */
  async function onHost<T>(host: string, task: () => Promise<T>): Promise<T> {
    const state = hostState(host);
    while (state.active >= concurrency) {
      await new Promise<void>((resolve) => state.waiters.push(resolve));
    }
    state.active++;
    try {
      // Reserve the start slot before sleeping so parallel callers queue behind it.
      const startAt = Math.max(now(), state.nextStartAt);
      state.nextStartAt = startAt + state.delayMs;
      const wait = startAt - now();
      if (wait > 0) await sleep(wait);
      return await task();
    } finally {
      state.active--;
      state.waiters.shift()?.();
    }
  }

  /** One request with retries; each attempt goes through the host limiter. */
  async function send(url: URL, input: FetchInput, init: RequestInit, method: string) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set('User-Agent', userAgent);

    const maxAttempts = RETRYABLE_METHODS.has(method) ? retries + 1 : 1;
    for (let attempt = 1; ; attempt++) {
      try {
        // The timeout starts when the request does, not while it waits for its slot.
        const res = await onHost(url.host, () =>
          baseFetch(input, {
            ...init,
            headers,
            signal: init.signal ?? AbortSignal.timeout(timeoutMs),
          }),
        );
        if (!isRetryableStatus(res.status) || attempt >= maxAttempts) return res;
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'), now());
        const wait = Math.min(retryAfter ?? backoffMs * 2 ** (attempt - 1), maxRetryAfterMs);
        log(`HTTP ${res.status} from ${url.href}; retry ${attempt}/${retries} in ${wait} ms`);
        await res.body?.cancel();
        await sleep(wait);
      } catch (err) {
        if (attempt >= maxAttempts || init.signal?.aborted) throw err;
        const wait = backoffMs * 2 ** (attempt - 1);
        const message = err instanceof Error ? err.message : String(err);
        log(`${message} for ${url.href}; retry ${attempt}/${retries} in ${wait} ms`);
        await sleep(wait);
      }
    }
  }

  async function loadRobots(url: URL): Promise<Robots> {
    const robotsUrl = new URL('/robots.txt', url.origin);
    try {
      const res = await send(robotsUrl, robotsUrl, {}, 'GET');
      if (res.ok) {
        const robots = parseRobots(await res.text());
        const delay = crawlDelayMs(robots, token);
        if (delay !== undefined) {
          const state = hostState(url.host);
          if (delay > maxCrawlDelayMs) {
            log(`${url.host} asks for Crawl-delay ${delay} ms; capping at ${maxCrawlDelayMs} ms`);
          }
          state.delayMs = Math.max(state.delayMs, Math.min(delay, maxCrawlDelayMs));
        }
        return robots;
      }
      await res.body?.cancel();
      // RFC 9309: 4xx means no restrictions; 5xx means assume complete disallow.
      if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
      log(`robots.txt for ${url.origin} returned HTTP ${res.status}; treating host as disallowed`);
      return DISALLOW_ALL;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`robots.txt for ${url.origin} unreachable (${message}); treating host as disallowed`);
      return DISALLOW_ALL;
    }
  }

  function robotsFor(url: URL): Promise<Robots> {
    let robots = robotsByOrigin.get(url.origin);
    if (!robots) {
      robots = loadRobots(url);
      robotsByOrigin.set(url.origin, robots);
    }
    return robots;
  }

  async function snapshot(res: Response): Promise<Snapshot> {
    return {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers],
      body: await res.arrayBuffer(),
      url: res.url,
    };
  }

  return async function politeFetch(input: FetchInput, init: RequestInit = {}) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

    const robots = await robotsFor(url);
    if (!isAllowed(robots, token, url.pathname + url.search)) {
      throw new RobotsDisallowedError(url.href);
    }

    if (method !== 'GET') return send(url, input, init, method);

    const key = url.href;
    const cached = cache.get(key);
    if (cached) return toResponse(await cached);

    const pending = send(url, input, init, method).then(snapshot);
    cache.set(key, pending);
    let snap: Snapshot;
    try {
      snap = await pending;
    } catch (err) {
      cache.delete(key);
      throw err;
    }
    if (snap.status < 200 || snap.status >= 300) cache.delete(key);
    return toResponse(snap);
  } as typeof fetch;
}
