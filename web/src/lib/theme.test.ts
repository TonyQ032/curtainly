import { describe, expect, it } from 'vitest';
import { parseThemePreference, THEME_INIT_SCRIPT } from './theme';

describe('parseThemePreference', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [null, 'system'],
    ['purple', 'system'],
  ])('%s → %s', (input, expected) => {
    expect(parseThemePreference(input)).toBe(expected);
  });
});

describe('THEME_INIT_SCRIPT', () => {
  function run(stored: string | null, throws = false) {
    const root = { dataset: {} as Record<string, string> };
    const localStorage = {
      getItem: () => {
        if (throws) throw new Error('blocked');
        return stored;
      },
    };
    new Function('document', 'localStorage', THEME_INIT_SCRIPT)(
      { documentElement: root },
      localStorage,
    );
    return root.dataset.theme;
  }

  it('applies a saved theme', () => {
    expect(run('dark')).toBe('dark');
    expect(run('light')).toBe('light');
  });

  it('leaves the system theme alone', () => {
    expect(run(null)).toBeUndefined();
    expect(run('bogus')).toBeUndefined();
  });

  it('survives blocked storage', () => {
    expect(run(null, true)).toBeUndefined();
  });
});
