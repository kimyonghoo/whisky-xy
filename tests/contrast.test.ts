import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * WCAG contrast guard for the design tokens in src/app/globals.css.
 * Reads the `:root` block, so a token change that breaks AA fails here, not in production.
 */
const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

function rootTokens(source: string): Record<string, string> {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(source);
  if (!block) throw new Error(':root block not found in globals.css');
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const tokens = rootTokens(css);

/** Resolve a token (or a literal hex) to [r, g, b] in 0–255. Supports #rgb, #rrggbb and var(--x) aliases. */
function rgb(name: string): [number, number, number] {
  let value = name.startsWith('#') ? name : tokens[name];
  if (value === undefined) throw new Error(`token --${name} is not defined in :root`);
  for (let i = 0; i < 5; i++) {
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    if (!alias) break;
    value = tokens[alias[1]];
    if (value === undefined) throw new Error(`token --${name} aliases an undefined token`);
  }
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
  if (!hex) throw new Error(`token --${name} must be a hex colour to be contrast-checked (got "${value}")`);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: string, bg: string): number {
  const a = luminance(rgb(fg));
  const b = luminance(rgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const STATUSES = ['instock', 'soldout', 'caution', 'stale', 'danger', 'info'];
const VERDICTS = ['must', 'big', 'good', 'small', 'worse'];

const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['faint', 'background'],
  ['faint', 'card'],
  // Faint labels (준비 중, English sub-names) also sit on selected (gold-tint) and hovered rows.
  ['faint', 'primary-soft'],
  ['faint', 'muted'],
  ['faint', 'popover'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary', 'primary-soft'],
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

describe('design tokens: WCAG contrast (dark theme)', () => {
  it('is a dark theme: background relative luminance < 0.01', () => {
    expect(luminance(rgb('background'))).toBeLessThan(0.01);
  });

  it.each(TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('button text primary-foreground on primary is at least 3:1', () => {
    expect(ratio('primary-foreground', 'primary')).toBeGreaterThanOrEqual(3);
  });

  // Solid badges render on-solid text on these fills (PriceCompareChip, Badge "solid").
  it.each(['verdict-must', 'verdict-big', 'verdict-worse', 'instock'])('on-solid text on solid %s is at least 4.5:1', (solid) => {
    expect(ratio('on-solid', solid)).toBeGreaterThanOrEqual(4.5);
  });

  // Non-text UI (bars on /compare, caution icon, focus ring) needs 3:1 against the surface it sits on.
  it.each([
    ['verdict-must', 'card'],
    ['verdict-big', 'card'],
    ['verdict-good', 'card'],
    ['verdict-small', 'card'],
    ['verdict-worse', 'card'],
    ['kr-bar', 'card'],
    ['caution-icon', 'caution-bg'],
    ['verdict-must-glow', 'verdict-must'],
    ['ring', 'background'],
    ['ring', 'card'],
  ])('non-text %s on %s is at least 3:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
