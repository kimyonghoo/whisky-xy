import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CASKS, CASK_COOKIE, DEFAULT_CASK, DEFAULT_THEME, THEME_COLOR, THEME_COOKIE, caskCookieFor, isCask, isThemeMode, readThemePrefs,
  themeBootScript, themeCookieFor, type Cask, type ThemeMode,
} from '@/lib/theme';
import { DictProvider } from '@/lib/i18n/client';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n';
import { ThemeMenuContent } from '@/components/ThemeMenu';

describe('theme whitelists', () => {
  it('accepts only the two modes and five casks', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    for (const v of ['', 'Dark', 'sepia', null, undefined, 1]) expect(isThemeMode(v)).toBe(false);
    for (const c of CASKS) expect(isCask(c)).toBe(true);
    for (const v of ['', 'sherry', 'PX', '<script>', null]) expect(isCask(v)).toBe(false);
  });

  it('defaults to light + oloroso', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(DEFAULT_CASK).toBe('oloroso');
  });
});

describe('readThemePrefs', () => {
  it('reads both cookies among others', () => {
    expect(readThemePrefs('wi_lang=en; rw_theme=dark; rw_cask=port; wi_city=la')).toEqual({ theme: 'dark', cask: 'port' });
  });

  it('falls back to the default for missing or unknown values', () => {
    expect(readThemePrefs('')).toEqual({ theme: 'light', cask: 'oloroso' });
    expect(readThemePrefs('rw_theme=sepia; rw_cask=sherry')).toEqual({ theme: 'light', cask: 'oloroso' });
    expect(readThemePrefs('rw_theme=dark')).toEqual({ theme: 'dark', cask: 'oloroso' });
  });

  it('does not match a cookie whose name only ends with the theme cookie name', () => {
    expect(readThemePrefs('xrw_theme=dark; xrw_cask=px')).toEqual({ theme: 'light', cask: 'oloroso' });
  });
});

describe('theme cookies', () => {
  it('remember the mode and cask for a year, site-wide, SameSite=Lax', () => {
    expect(themeCookieFor('dark')).toBe(`${THEME_COOKIE}=dark; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(caskCookieFor('px')).toBe(`${CASK_COOKIE}=px; Path=/; Max-Age=31536000; SameSite=Lax`);
  });
});

/** Runs the boot script against a minimal fake document and returns what it set. */
function boot(cookie: string) {
  const attrs: Record<string, string> = {};
  const meta: Record<string, string> = { content: THEME_COLOR.light };
  const fakeDocument = {
    cookie,
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    querySelectorAll: () => [{ setAttribute: (k: string, v: string) => (meta[k] = v) }],
    addEventListener: () => {},
  };
  new Function('document', themeBootScript())(fakeDocument);
  return { theme: attrs['data-theme'], cask: attrs['data-cask'], color: meta.content };
}

describe('themeBootScript', () => {
  it('applies a stored valid choice and the matching theme colour', () => {
    expect(boot('rw_theme=dark; rw_cask=bourbon')).toEqual({ theme: 'dark', cask: 'bourbon', color: THEME_COLOR.dark });
  });

  it('applies the default for no cookies or tampered values', () => {
    const fallback = { theme: 'light', cask: 'oloroso', color: THEME_COLOR.light };
    expect(boot('')).toEqual(fallback);
    expect(boot('rw_theme="><script>; rw_cask=constructor')).toEqual(fallback);
    expect(boot('rw_theme=__proto__; rw_cask=toString')).toEqual(fallback);
  });

  it('contains only the whitelists and constants, no markup', () => {
    const s = themeBootScript();
    expect(s).not.toMatch(/<\/?script/i);
    for (const c of CASKS) expect(s).toContain(`"${c}"`);
  });
});

const render = (locale: Locale, theme: ThemeMode, cask: Cask) =>
  renderToStaticMarkup(
    <DictProvider locale={locale}>
      <ThemeMenuContent theme={theme} cask={cask} onTheme={() => {}} onCask={() => {}} />
    </DictProvider>,
  );

describe('ThemeMenuContent', () => {
  it('shows the mode switch and all five casks with names and sub lines (ko)', () => {
    const html = render('ko', 'light', 'oloroso');
    expect(html).toContain(ko.theme.mode);
    expect(html).toContain(ko.theme.cask);
    expect(html).toContain(ko.theme.modes.light);
    expect(html).toContain(ko.theme.modes.dark);
    for (const c of CASKS) {
      expect(html).toContain(`data-cask-option="${c}"`);
      expect(html).toContain(ko.theme.casks[c].name);
      expect(html).toContain(ko.theme.casks[c].sub);
      expect(html).toContain(`bg-cask-${c}`);
    }
    // Korean names carry the English name as a small echo.
    expect(html).toContain('>Pedro Ximénez<');
  });

  it('marks exactly the current mode and cask as pressed', () => {
    const html = render('ko', 'dark', 'port');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(2);
    expect(html).toMatch(/data-theme-mode="dark" aria-pressed="true"/);
    expect(html).toMatch(/data-theme-mode="light" aria-pressed="false"/);
    expect(html).toMatch(/data-cask-option="port" aria-pressed="true"/);
    expect(html).toMatch(/data-cask-option="oloroso" aria-pressed="false"/);
  });

  it('uses English names in /en without repeating them', () => {
    const html = render('en', 'light', 'bourbon');
    for (const c of CASKS) expect(html).toContain(en.theme.casks[c].name);
    expect(html.split('>Bourbon<').length - 1).toBe(1);
    expect(html).toContain('Honey amber');
    expect(html).not.toMatch(/[가-힣]/);
  });
});
