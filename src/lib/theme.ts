// Display preferences: light/dark mode and the cask accent colour. Pure helpers (no DOM, no Next
// imports), shared by the root layout's pre-paint script, the header theme menu and tests.
// The CSS for each value lives in src/app/globals.css (`[data-theme]`, `[data-cask]`).

export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const CASKS = ['bourbon', 'oloroso', 'madeira', 'px', 'port'] as const;
export type Cask = (typeof CASKS)[number];

export const DEFAULT_THEME: ThemeMode = 'light';
export const DEFAULT_CASK: Cask = 'oloroso';

export const THEME_COOKIE = 'rw_theme';
export const CASK_COOKIE = 'rw_cask';

/**
 * Browser chrome colour (`<meta name="theme-color">`) per mode: the page background.
 * Must equal `--background` in globals.css (tests/contrast.test.ts checks it).
 */
export const THEME_COLOR: Record<ThemeMode, string> = { light: '#f7f2ea', dark: '#0a0a0a' };

const ONE_YEAR = 60 * 60 * 24 * 365;

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v);
}

export function isCask(v: unknown): v is Cask {
  return typeof v === 'string' && (CASKS as readonly string[]).includes(v);
}

/** One cookie's raw value from a `document.cookie` string, or null. */
function cookieValue(cookie: string, name: string): string | null {
  for (const part of cookie.split(';')) {
    const at = part.indexOf('=');
    if (at !== -1 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** The stored mode and cask from a `document.cookie` string; anything unknown falls back to the default. */
export function readThemePrefs(cookie: string): { theme: ThemeMode; cask: Cask } {
  const theme = cookieValue(cookie, THEME_COOKIE);
  const cask = cookieValue(cookie, CASK_COOKIE);
  return { theme: isThemeMode(theme) ? theme : DEFAULT_THEME, cask: isCask(cask) ? cask : DEFAULT_CASK };
}

function prefCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

/** The `document.cookie` string that remembers the mode for a year. */
export function themeCookieFor(mode: ThemeMode): string {
  return prefCookie(THEME_COOKIE, mode);
}

/** The `document.cookie` string that remembers the cask for a year. */
export function caskCookieFor(cask: Cask): string {
  return prefCookie(CASK_COOKIE, cask);
}

/**
 * The inline script at the start of `<head>`: reads the two cookies, validates them against the
 * whitelists and sets `<html data-theme data-cask>` plus the theme-color meta before first paint.
 * Built only from the constants above, never from request data. The layout itself never reads
 * cookies, so pages stay statically prerendered with the light + oloroso default.
 */
export function themeBootScript(): string {
  const j = JSON.stringify;
  return (
    '(function(){try{' +
    'var d=document.documentElement,c=document.cookie;' +
    'function g(n){var p=c.split(";");for(var i=0;i<p.length;i++){var e=p[i].indexOf("=");if(e>-1&&p[i].slice(0,e).trim()===n)return p[i].slice(e+1).trim()}return null}' +
    `var t=g(${j(THEME_COOKIE)}),k=g(${j(CASK_COOKIE)});` +
    `if(${j(THEME_MODES)}.indexOf(t)<0)t=${j(DEFAULT_THEME)};` +
    `if(${j(CASKS)}.indexOf(k)<0)k=${j(DEFAULT_CASK)};` +
    'd.setAttribute("data-theme",t);d.setAttribute("data-cask",k);' +
    `var m=${j(THEME_COLOR)}[t];` +
    'function s(){var e=document.querySelectorAll(\'meta[name="theme-color"]\');for(var i=0;i<e.length;i++)e[i].setAttribute("content",m)}' +
    's();document.addEventListener("DOMContentLoaded",s)' +
    '}catch(e){}})()'
  );
}
