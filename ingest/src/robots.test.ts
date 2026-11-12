import { describe, expect, it } from 'vitest';
import { crawlDelayMs, isAllowed, parseRobots, productToken } from './robots';

const token = 'curtainlybot';

describe('productToken', () => {
  it('takes the name before the version', () => {
    expect(productToken('CurtainlyBot/0.1 (+https://github.com/x/y)')).toBe('curtainlybot');
  });
});

describe('parseRobots + isAllowed', () => {
  it('allows everything for an empty file', () => {
    expect(isAllowed(parseRobots(''), token, '/anything')).toBe(true);
  });

  it('uses the * group when no group names us', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /private\n');
    expect(isAllowed(robots, token, '/private/page')).toBe(false);
    expect(isAllowed(robots, token, '/shows')).toBe(true);
  });

  it('prefers a group naming our token over *', () => {
    const robots = parseRobots(
      ['User-agent: *', 'Disallow: /', '', 'User-agent: CurtainlyBot', 'Disallow: /admin'].join(
        '\n',
      ),
    );
    expect(isAllowed(robots, token, '/shows')).toBe(true);
    expect(isAllowed(robots, token, '/admin')).toBe(false);
    expect(isAllowed(robots, 'otherbot', '/shows')).toBe(false);
  });

  it('lets several user-agent lines share one group', () => {
    const robots = parseRobots('User-agent: a\nUser-agent: curtainlybot\nDisallow: /x\n');
    expect(isAllowed(robots, token, '/x')).toBe(false);
  });

  it('picks the longest match, and Allow on a tie', () => {
    const robots = parseRobots(
      'User-agent: *\nDisallow: /events\nAllow: /events/shows\nDisallow: /a\nAllow: /a\n',
    );
    expect(isAllowed(robots, token, '/events/gala')).toBe(false);
    expect(isAllowed(robots, token, '/events/shows/1')).toBe(true);
    expect(isAllowed(robots, token, '/a')).toBe(true);
  });

  it('supports * wildcards and $ anchors', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?sessionid=\n');
    expect(isAllowed(robots, token, '/files/program.pdf')).toBe(false);
    expect(isAllowed(robots, token, '/files/program.pdf?x=1')).toBe(true);
    expect(isAllowed(robots, token, '/shows?sessionid=abc')).toBe(false);
  });

  it('ignores comments, blank Disallow and unknown keys', () => {
    const robots = parseRobots(
      '# hi\nUser-agent: * # everyone\nDisallow:\nSitemap: https://x/s.xml\nDisallow: /tmp # temp\n',
    );
    expect(isAllowed(robots, token, '/shows')).toBe(true);
    expect(isAllowed(robots, token, '/tmp/1')).toBe(false);
  });

  it('always allows /robots.txt', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow: /'), token, '/robots.txt')).toBe(true);
  });
});

describe('crawlDelayMs', () => {
  it('reads Crawl-delay in seconds', () => {
    expect(crawlDelayMs(parseRobots('User-agent: *\nCrawl-delay: 5\n'), token)).toBe(5000);
  });
  it('is undefined when unset', () => {
    expect(crawlDelayMs(parseRobots('User-agent: *\nDisallow:\n'), token)).toBeUndefined();
  });
});
