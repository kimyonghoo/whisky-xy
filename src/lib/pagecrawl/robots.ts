export interface Robots {
  isAllowed(path: string): boolean;
  /** Crawl-delay of the selected group in milliseconds, or null when absent or invalid. */
  crawlDelayMs: number | null;
}

interface Rule { allow: boolean; strict: RegExp; loose: RegExp; length: number }
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

/**
 * The loose form, applied to both pattern and path: `%2F %3F %3D %26` decoded to `/ ? = &` and ASCII
 * letters lower-cased. Applied after `canonical`, so escapes are already upper-case hex.
 */
function loosen(canon: string): string {
  return canon
    .replace(/%2F/g, '/')
    .replace(/%3F/g, '?')
    .replace(/%3D/g, '=')
    .replace(/%26/g, '&')
    .toLowerCase();
}

function toRegex(body: string, anchored: boolean): RegExp {
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

/** RFC 9309 rule length in octets of the pattern as written: `%XX` is 1, a raw character is its UTF-8 length, `*` and `$` are 1. */
function octetLength(pattern: string): number {
  let n = 0;
  for (let i = 0; i < pattern.length; ) {
    if (pattern[i] === '%' && /^[0-9a-fA-F]{2}$/.test(pattern.slice(i + 1, i + 3))) {
      n += 1;
      i += 3;
      continue;
    }
    const ch = String.fromCodePoint(pattern.codePointAt(i)!);
    n += Buffer.byteLength(ch, 'utf8');
    i += ch.length;
  }
  return n;
}

function compile(pattern: string): { strict: RegExp; loose: RegExp; length: number } {
  const anchored = pattern.endsWith('$');
  const body = canonical(anchored ? pattern.slice(0, -1) : pattern, true);
  return {
    strict: toRegex(body, anchored),
    loose: toRegex(loosen(body), anchored),
    length: octetLength(pattern),
  };
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
 * applies (groups for the same agent are merged). Longest matching Allow/Disallow wins (length in
 * decoded octets), Allow on a tie; `*` and a trailing `$` are supported.
 *
 * Deliberately stricter than RFC 9309: a path is allowed only if it is allowed under BOTH the strict
 * canonical percent-encoding match AND a loose match in which `%2F %3F %3D %26` equal `/ ? = &` and
 * ASCII case is ignored. Each form does its own longest-match. The cost is that a few paths that
 * RFC 9309 would allow are refused; the benefit is that we never fetch a resource the owner may have
 * disallowed through an encoding or case variant.
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
      const strict = canonical(path, false);
      const loose = loosen(strict);
      const allowedBy = (p: string, form: 'strict' | 'loose'): boolean => {
        let best: Rule | null = null;
        for (const rule of rules) {
          if (!rule[form].test(p)) continue;
          if (!best || rule.length > best.length || (rule.length === best.length && rule.allow && !best.allow)) best = rule;
        }
        return best ? best.allow : true;
      };
      return allowedBy(strict, 'strict') && allowedBy(loose, 'loose');
    },
    crawlDelayMs: delays.length > 0 ? Math.max(...delays) : null,
  };
}
