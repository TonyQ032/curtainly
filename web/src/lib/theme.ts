/** Theme preference: 'system' follows the OS; 'light'/'dark' set data-theme on <html>. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'curtainly-theme';
export const THEME_CHANGE_EVENT = 'curtainly-theme-change';

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * Inlined in <head> so the saved theme applies before first paint (no flash).
 * Keep it tiny and dependency-free; it runs before React.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;
