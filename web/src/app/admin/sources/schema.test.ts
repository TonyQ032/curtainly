import { describe, expect, it } from 'vitest';
import { parseSourceConfig } from './config';
import { sourceFormSchema } from './schema';

const companyId = '3f0e8a52-6c1d-4b8e-9a51-2f6a0c9d1e77';

describe('parseSourceConfig', () => {
  it('accepts valid config per kind', () => {
    expect(parseSourceConfig('ovationtix', '{"clientId": "36001"}')).toEqual({
      ok: true,
      config: { clientId: 36001 },
    });
    expect(parseSourceConfig('jsonld', '{"url":"https://example.org/shows"}').ok).toBe(true);
    expect(parseSourceConfig('ticketmaster', '{"venueIds":["A"," B "]}')).toEqual({
      ok: true,
      config: { venueIds: ['A', 'B'] },
    });
  });

  it('treats blank as an empty object for manual sources only', () => {
    expect(parseSourceConfig('manual', '  ')).toEqual({ ok: true, config: {} });
    expect(parseSourceConfig('vbo', '').ok).toBe(false);
  });

  it('rejects bad JSON, non-objects, unknown keys and bad values', () => {
    expect(parseSourceConfig('vbo', '{nope')).toEqual({
      ok: false,
      errors: ['Config must be valid JSON'],
    });
    expect(parseSourceConfig('vbo', '[]')).toEqual({
      ok: false,
      errors: ['Config must be a JSON object'],
    });
    expect(parseSourceConfig('manual', '{"url":"https://x.org"}').ok).toBe(false);
    expect(parseSourceConfig('vbo', '{"url":"ftp://x.org"}').ok).toBe(false);
    expect(parseSourceConfig('ovationtix', '{"clientId":-1}').ok).toBe(false);
    expect(parseSourceConfig('ticketmaster', '{"venueIds":[]}').ok).toBe(false);
  });
});

describe('sourceFormSchema', () => {
  it('parses config for the chosen kind and reads checkboxes', () => {
    expect(
      sourceFormSchema.parse({
        companyId,
        kind: 'thundertix',
        config: '{"url":"https://a.thundertix.com/events"}',
        enabled: 'on',
      }),
    ).toEqual({
      companyId,
      kind: 'thundertix',
      config: { url: 'https://a.thundertix.com/events' },
      enabled: true,
      autoApprove: false,
    });
  });

  it('reports config errors on the config field', () => {
    const r = sourceFormSchema.safeParse({ companyId, kind: 'vbo', config: '{}' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['config']);
  });

  it('rejects unknown kinds and bad company ids', () => {
    expect(sourceFormSchema.safeParse({ companyId: 'x', kind: 'nope', config: '{}' }).success).toBe(
      false,
    );
  });
});
