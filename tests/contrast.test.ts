import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CASKS, THEME_COLOR, THEME_MODES, type Cask, type ThemeMode } from '@/lib/theme';

/**
 * WCAG contrast guard for the design tokens in src/app/globals.css.
 * Parses every top-level token block (`:root`, `[data-theme]`, `[data-theme][data-cask]`) and
 * resolves the tokens <html> gets for each mode × cask the way the cascade does (specificity, then
 * source order). A token change that breaks AA in any combination fails here, not in production.
 */
const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

interface Rule {
  selectors: string[];
  decls: Record<string, string>;
  order: number;
}

/** Top-level rules made only of :root / [data-theme] / [data-cask] selectors (the theme blocks). */
function themeRules(source: string): Rule[] {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let order = 0;
  for (const m of noComments.matchAll(/(^|\n)([^{}@\n][^{}]*?)\s*\{([^{}]*)\}/g)) {
    const selectors = m[2].split(',').map((s) => s.trim());
    if (!selectors.every((s) => /^(:root|(\[data-(theme|cask)="[\w-]+"\])+)$/.test(s))) continue;
    const decls: Record<string, string> = {};
    for (const d of m[3].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
    rules.push({ selectors, decls, order: order++ });
  }
  return rules;
}

const RULES = themeRules(css);

/** Specificity of the most specific selector in `rule` that matches <html data-theme data-cask>, or -1. */
function matchSpecificity(selectors: string[], attrs: Record<string, string | undefined>): number {
  let best = -1;
  for (const s of selectors) {
    if (s === ':root') {
      best = Math.max(best, 1);
      continue;
    }
    const parts = [...s.matchAll(/\[data-(theme|cask)="([\w-]+)"\]/g)];
    if (parts.every((p) => attrs[p[1]] === p[2])) best = Math.max(best, parts.length);
  }
  return best;
}

/** The custom properties <html> ends up with for these attributes (undefined = attribute absent). */
function tokensFor(theme?: ThemeMode, cask?: Cask): Record<string, string> {
  const attrs = { theme, cask };
  const matched = RULES.map((r) => ({ r, spec: matchSpecificity(r.selectors, attrs) }))
    .filter((x) => x.spec >= 0)
    .sort((a, b) => a.spec - b.spec || a.r.order - b.r.order);
  return Object.assign({}, ...matched.map((x) => x.r.decls));
}

type RGB = [number, number, number];

/** Resolve a token (or a literal hex) to [r, g, b] in 0–255. Supports #rgb, #rrggbb and var(--x) aliases. */
function rgbIn(tokens: Record<string, string>, name: string): RGB {
  let value = name.startsWith('#') ? name : tokens[name];
  if (value === undefined) throw new Error(`token --${name} is not defined`);
  for (let i = 0; i < 5; i++) {
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    if (!alias) break;
    value = tokens[alias[1]];
    if (value === undefined) throw new Error(`token --${name} aliases an undefined token`);
  }
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
  if (!hex) throw new Error(`token --${name} must be a hex colour to be contrast-checked (got "${value}")`);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratioIn(tokens: Record<string, string>, fg: string, bg: string): number {
  const a = luminance(rgbIn(tokens, fg));
  const b = luminance(rgbIn(tokens, bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const STATUSES = ['instock', 'soldout', 'caution', 'stale', 'danger', 'info'];
const VERDICTS = ['must', 'big', 'good', 'small', 'worse'];

/** Text pairs that depend only on the mode's neutrals and status colours. */
const NEUTRAL_TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'popover'],
  ['faint', 'background'],
  ['faint', 'card'],
  ['faint', 'muted'],
  ['faint', 'popover'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ...STATUSES.map((s): [string, string] => [`${s}-fg`, `${s}-bg`]),
  ...STATUSES.map((s): [string, string] => [`${s}-fg`, 'card']),
  ...VERDICTS.map((v): [string, string] => [`verdict-${v}-ink`, `verdict-${v}-bg`]),
  ...VERDICTS.map((v): [string, string] => [`verdict-${v}-ink`, 'card']),
];

/** Text pairs that involve the cask accent. */
const ACCENT_TEXT_PAIRS: [string, string][] = [
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary', 'popover'],
  ['primary', 'primary-soft'],
  // Faint labels (준비 중, English sub-names) also sit on selected (accent-tint) rows.
  ['faint', 'primary-soft'],
  ['muted-foreground', 'primary-soft'],
  ['foreground', 'primary-soft'],
  // Text on the small accent fills (map markers).
  ['primary-foreground', 'primary'],
];

// Solid badges render on-solid text on these fills (PriceCompareChip, Badge "solid").
const SOLIDS = ['verdict-must', 'verdict-big', 'verdict-worse', 'instock'];

// Non-text UI (bars on /compare, caution icon, focus ring) needs 3:1 against the surface it sits on.
const NON_TEXT_PAIRS: [string, string][] = [
  ['verdict-must', 'card'],
  ['verdict-big', 'card'],
  ['verdict-good', 'card'],
  ['verdict-small', 'card'],
  ['verdict-worse', 'card'],
  ['kr-bar', 'card'],
  ['caution-icon', 'caution-bg'],
];
const ACCENT_NON_TEXT_PAIRS: [string, string][] = [
  ['ring', 'background'],
  ['ring', 'card'],
  ['ring', 'popover'],
];

const COMBOS = THEME_MODES.flatMap((mode) => CASKS.map((cask) => [mode, cask] as const));

describe('theme blocks in globals.css', () => {
  it('defines a block for every mode × cask', () => {
    for (const [mode, cask] of COMBOS) {
      expect(RULES.some((r) => r.selectors.includes(`[data-theme="${mode}"][data-cask="${cask}"]`)), `${mode} ${cask}`).toBe(true);
    }
  });

  it('bare :root resolves to light + oloroso', () => {
    const bare = tokensFor();
    const lightOloroso = tokensFor('light', 'oloroso');
    expect(bare).toEqual(lightOloroso);
    expect(bare.background).toBe(THEME_COLOR.light);
  });

  it('every cask overrides the same accent tokens in both modes', () => {
    const keysOf = (mode: ThemeMode, cask: Cask) =>
      Object.keys(RULES.find((r) => r.selectors.includes(`[data-theme="${mode}"][data-cask="${cask}"]`))!.decls).sort();
    const reference = keysOf('light', 'oloroso');
    for (const key of ['primary', 'primary-foreground', 'primary-soft', 'ring', 'honey', 'pour-liquid', 'verdict-must-line']) {
      expect(reference).toContain(key);
    }
    for (const [mode, cask] of COMBOS) expect(keysOf(mode, cask), `${mode} ${cask}`).toEqual(reference);
  });

  it('the theme-color meta values match each mode background', () => {
    for (const mode of THEME_MODES) expect(tokensFor(mode, 'oloroso').background).toBe(THEME_COLOR[mode]);
  });

  it('keeps the dark mode with bourbon exactly as the original gold theme', () => {
    const t = tokensFor('dark', 'bourbon');
    expect(t.background).toBe('#0a0a0a');
    expect(t.primary).toBe('#d4af6a');
    expect(t['primary-soft']).toBe('#1d1912');
    expect(t['primary-foreground']).toBe('#0a0a0a');
    expect(t['verdict-must-line']).toBe('#b8924f');
  });

  it('is light on light and dark on dark', () => {
    expect(luminance(rgbIn(tokensFor('dark', 'oloroso'), 'background'))).toBeLessThan(0.01);
    expect(luminance(rgbIn(tokensFor('light', 'oloroso'), 'background'))).toBeGreaterThan(0.85);
    expect(css).toMatch(/:root,\n\[data-theme="light"\] \{\n {2}color-scheme: light;/);
    expect(css).toMatch(/\[data-theme="dark"\] \{\n {2}color-scheme: dark;/);
  });
});

describe.each(THEME_MODES)('design tokens: WCAG contrast, %s neutrals', (mode) => {
  const tokens = tokensFor(mode, 'oloroso');

  it.each(NEUTRAL_TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratioIn(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SOLIDS)('on-solid text on solid %s is at least 4.5:1', (solid) => {
    expect(ratioIn(tokens, 'on-solid', solid)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('non-text %s on %s is at least 3:1', (fg, bg) => {
    expect(ratioIn(tokens, fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(COMBOS)('design tokens: WCAG contrast, %s + %s', (mode, cask) => {
  const tokens = tokensFor(mode, cask);

  it.each(ACCENT_TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratioIn(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENT_NON_TEXT_PAIRS)('non-text %s on %s is at least 3:1', (fg, bg) => {
    expect(ratioIn(tokens, fg, bg)).toBeGreaterThanOrEqual(3);
  });

  // The verdict "must" ink sits on a band edged with the cask's decorative line; the ink stays AA.
  it('verdict-must ink stays AA on its band and on card', () => {
    expect(ratioIn(tokens, 'verdict-must-ink', 'verdict-must-bg')).toBeGreaterThanOrEqual(4.5);
    expect(ratioIn(tokens, 'verdict-must-ink', 'card')).toBeGreaterThanOrEqual(4.5);
  });
});
