export interface Robots {
  isAllowed(path: string): boolean;
  /** Crawl-delay of the selected group in milliseconds, or null when absent or invalid. */
  crawlDelayMs: number | null;
}

interface Rule { allow: boolean; regex: RegExp; length: number }
interface Group { agents: string[]; rules: { allow: boolean; pattern: string }[]; delays: number[] }

/** Characters kept as-is in the canonical form: unreserved, plus the structural `/ ? = &`. */
const KEEP_RAW = /[A-Za-z0-9\-._~/?=&]/;

const pct = (byte: number) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * The one canonical form shared by robots patterns and the path that goes on the wire (the path
 * after `new URL`), used only for matching:
 * - `%XX` of an unreserved character (A-Z a-z 0-9 - . _ ~) is decoded;
 * - the structural characters `/ ? = &` stay as they are (so `%2F` stays `%2F`);
 * - everything else, raw or already escaped, becomes an upper-case `%XX` per UTF-8 byte
 *   (`^`, `%5e` and `%5E` all give `%5E`; a lone `%` gives `%25`);
 * - `*` stays a wildcard in patterns (`keepStar`) and is encoded as `%2A` in a path.
 */
function canonical(s: string, keepStar: boolean): string {
  let out = '';
  for (let i = 0; i < s.length; ) {
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    const hex = ch === '%' ? /^[0-9a-fA-F]{2}/.exec(s.slice(i + 1, i + 3)) : null;
    if (hex) {
      const byte = parseInt(hex[0], 16);
      const c = String.fromCharCode(byte);
      out += byte < 0x80 && /[A-Za-z0-9\-._~]/.test(c) ? c : pct(byte);
      i += 3;
      continue;
    }
    i += ch.length;
    if (KEEP_RAW.test(ch) || (keepStar && ch === '*')) {
      out += ch;
    } else if (ch.codePointAt(0)! < 0x80) {
      out += pct(ch.charCodeAt(0));
    } else {
      try {
        out += encodeURIComponent(ch);
      } catch {
        out += '%EF%BF%BD'; // lone surrogate
      }
    }
  }
  return out;
}

function compile(pattern: string): { regex: RegExp; length: number } {
  const anchored = pattern.endsWith('$');
  const body = canonical(anchored ? pattern.slice(0, -1) : pattern, true);
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return { regex: new RegExp(`^${source}${anchored ? '$' : ''}`), length: body.length + (anchored ? 1 : 0) };
}

/** The product token of a User-Agent: `WhiskyPortalBot/0.1 (+https://x)` becomes `whiskyportalbot`. */
function productToken(userAgent: string): string {
  return userAgent.trim().split(/[\s/]/)[0].toLowerCase();
}

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let collectingAgents = false;
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [], delays: [] };
        groups.push(current);
      }
      current.agents.push(productToken(value));
      collectingAgents = true;
      continue;
    }
    // Only rule lines end a group's User-agent list; Sitemap and unknown fields are skipped.
    if (field !== 'allow' && field !== 'disallow' && field !== 'crawl-delay') continue;
    collectingAgents = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "nothing is disallowed"; an empty Allow adds nothing.
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      // Infinity (e.g. 1e999) is kept so the fetcher refuses it; NaN and negatives are ignored.
      if (value && n >= 0) current.delays.push(Math.round(n * 1000));
    }
  }
  return groups;
}

/**
 * Parse robots.txt for one crawler. The group naming our product token wins; otherwise the `*` group
 * applies (groups for the same agent are merged). Longest matching Allow/Disallow wins, Allow on a tie;
 * `*` and a trailing `$` are supported.
 */
export function parseRobots(text: string, userAgent: string): Robots {
  const groups = parseGroups(text);
  const token = productToken(userAgent);
  const named = groups.filter((g) => g.agents.includes(token));
  const selected = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));

  const rules: Rule[] = selected
    .flatMap((g) => g.rules)
    .map((r) => ({ allow: r.allow, ...compile(r.pattern) }));
  const delays = selected.flatMap((g) => g.delays);

  return {
    isAllowed(path: string): boolean {
      const p = canonical(path, false);
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.regex.test(p)) continue;
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow && !best.allow)) best = rule;
      }
      return best ? best.allow : true;
    },
    crawlDelayMs: delays.length > 0 ? Math.max(...delays) : null,
  };
}
