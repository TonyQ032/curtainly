/**
 * Minimal robots.txt parser and matcher following RFC 9309:
 * - groups start with one or more `User-agent` lines; the group(s) naming our
 *   product token win, otherwise the `*` group(s), otherwise everything is allowed
 * - the longest matching `Allow`/`Disallow` pattern wins; on a tie, `Allow` wins
 * - `*` matches any run of characters and a trailing `$` anchors the end
 * - `Crawl-delay` (non-standard but common) is read in seconds
 */

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelaySec?: number;
}

export interface Robots {
  groups: Group[];
}

/** robots.txt that allows everything (missing file, 4xx). */
export const ALLOW_ALL: Robots = { groups: [] };

/** robots.txt that disallows everything (server error, unreachable). */
export const DISALLOW_ALL: Robots = {
  groups: [{ agents: ['*'], rules: [toRule(false, '/')] }],
};

function toRule(allow: boolean, pattern: string): Rule {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return { allow, pattern, regex: new RegExp(`^${source}${anchored ? '$' : ''}`) };
}

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;

    if (key === 'allow' || key === 'disallow') {
      // An empty Disallow means "allow everything"; it adds no rule.
      if (value) current.rules.push(toRule(key === 'allow', value));
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySec = seconds;
    }
  }
  return { groups };
}

/** `CurtainlyBot/0.1 (+https://…)` → `curtainlybot` */
export function productToken(userAgent: string): string {
  return (userAgent.trim().split(/[\s/]/)[0] ?? '').toLowerCase();
}

function groupsFor(robots: Robots, token: string): Group[] {
  const named = robots.groups.filter((g) => g.agents.includes(token));
  return named.length ? named : robots.groups.filter((g) => g.agents.includes('*'));
}

/** `path` is the URL path plus query string, e.g. `/shows?season=2027`. */
export function isAllowed(robots: Robots, token: string, path: string): boolean {
  if (path === '/robots.txt') return true;
  let best: Rule | undefined;
  for (const group of groupsFor(robots, token)) {
    for (const rule of group.rules) {
      if (!rule.regex.test(path)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow)
      ) {
        best = rule;
      }
    }
  }
  return best ? best.allow : true;
}

/** Crawl-delay in milliseconds for our token, if the file sets one. */
export function crawlDelayMs(robots: Robots, token: string): number | undefined {
  const delays = groupsFor(robots, token)
    .map((g) => g.crawlDelaySec)
    .filter((d): d is number => d !== undefined);
  return delays.length ? Math.max(...delays) * 1000 : undefined;
}
