export interface Robots {
  isAllowed(path: string): boolean;
  /** Crawl-delay of the selected group in milliseconds, or null when absent or invalid. */
  crawlDelayMs: number | null;
}

interface Rule { allow: boolean; regex: RegExp; length: number }
interface Group { agents: string[]; rules: { allow: boolean; pattern: string }[]; delays: number[] }

/** Decode percent-escapes of unreserved characters and upper-case the rest so `/%7Ea` equals `/~a`. */
function normalize(s: string): string {
  return s.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(ch) ? ch : `%${hex.toUpperCase()}`;
  });
}

function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
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
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }
    collectingAgents = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "nothing is disallowed"; an empty Allow adds nothing.
      if (value) current.rules.push({ allow: field === 'allow', pattern: normalize(value) });
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      if (value && Number.isFinite(n) && n >= 0) current.delays.push(Math.round(n * 1000));
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
    .map((r) => ({ allow: r.allow, regex: compile(r.pattern), length: r.pattern.length }));
  const delays = selected.flatMap((g) => g.delays);

  return {
    isAllowed(path: string): boolean {
      const p = normalize(path);
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
