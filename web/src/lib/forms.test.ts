import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseForm } from './forms';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  radius: z.coerce.number().int().positive('Must be positive'),
  tags: z.array(z.string()).optional(),
});

function fd(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe('parseForm', () => {
  it('returns typed data when valid', () => {
    const r = parseForm(
      schema,
      fd([
        ['name', ' San Diego '],
        ['radius', '45'],
      ]),
    );
    expect(r).toEqual({ ok: true, data: { name: 'San Diego', radius: 45 } });
  });

  it('collects field errors and echoes values', () => {
    const r = parseForm(
      schema,
      fd([
        ['name', ''],
        ['radius', '-1'],
      ]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state.status).toBe('error');
    expect(r.state.fieldErrors).toEqual({
      name: ['Name is required'],
      radius: ['Must be positive'],
    });
    expect(r.state.values).toEqual({ name: '', radius: '-1' });
  });

  it('keeps repeated fields as arrays', () => {
    const r = parseForm(
      schema,
      fd([
        ['name', 'x'],
        ['radius', '1'],
        ['tags', 'a'],
        ['tags', 'b'],
      ]),
    );
    expect(r.ok && r.data.tags).toEqual(['a', 'b']);
  });

  it('ignores React action fields', () => {
    const r = parseForm(
      schema,
      fd([
        ['$ACTION_ID_abc', ''],
        ['name', 'x'],
        ['radius', '1'],
      ]),
    );
    expect(r.ok).toBe(true);
  });
});
