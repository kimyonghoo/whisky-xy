import { describe, it, expect } from 'vitest';
import { crawlOutcome } from '@/lib/crawl/annotations';
import type { CrawlReport } from '@/lib/crawl/run';

type Entry = CrawlReport['stores'][number];
const entry = (over: Partial<Entry> & { storeId: string }): Entry => ({ ok: true, observations: 1, events: 0, ...over });
const report = (stores: Entry[]): CrawlReport => ({ stores, alertsSent: 0, fx: 'ok', krLinks: { ok: 0, failed: 0 } });

describe('crawlOutcome (GitHub Actions annotations and exit code)', () => {
  it('a clean run prints nothing and exits 0', () => {
    expect(crawlOutcome(report([entry({ storeId: 'flask' }), entry({ storeId: 'shinanoya', note: 'stopped: budget', stopReason: 'budget' })])))
      .toEqual({ annotations: [], exitCode: 0 });
  });

  it('a block detected this run is an ::error:: annotation and exit 1', () => {
    const r = report([
      entry({ storeId: 'flask' }),
      entry({ storeId: 'shinanoya', note: 'stopped: http-403', stopReason: 'http-403', block: { reason: 'http-403', since: '2026-10-13T03:17:00.000Z', detected: true } }),
    ]);
    expect(crawlOutcome(r)).toEqual({ annotations: ['::error title=Store blocked::shinanoya http-403'], exitCode: 1 });
  });

  it('a store skipped for an earlier block is a ::warning:: and does not fail the run', () => {
    const r = report([
      entry({ storeId: 'flask' }),
      entry({
        storeId: 'nemoto', observations: 0, note: 'skipped: blocked since 2026-10-13T03:17:00.000Z (challenge)',
        block: { reason: 'challenge', since: '2026-10-13T03:17:00.000Z', detected: false },
      }),
    ]);
    const out = crawlOutcome(r);
    expect(out.exitCode).toBe(0);
    expect(out.annotations).toEqual([
      '::warning::nemoto skipped: blocked since 2026-10-13T03:17:00.000Z (challenge); after checking the store, clear with npm run crawl:unblock -- --store nemoto',
    ]);
  });

  it.each(['http-503', 'robots-unavailable', 'errors', 'deadline', 'crawl-delay'] as const)('a %s stop is a ::warning:: only', (reason) => {
    const out = crawlOutcome(report([entry({ storeId: 'shinanoya', note: `stopped: ${reason}`, stopReason: reason })]));
    expect(out).toEqual({ annotations: [`::warning::shinanoya stopped: ${reason}`], exitCode: 0 });
  });

  it('a JP store skipped for the run budget is a ::warning::', () => {
    const out = crawlOutcome(report([entry({ storeId: 'flask' }), entry({ storeId: 'nemoto', observations: 0, note: 'skipped: run budget exhausted' })]));
    expect(out).toEqual({ annotations: ['::warning::nemoto skipped: run budget exhausted'], exitCode: 0 });
  });

  it('keeps the old rule: every store failing exits 1', () => {
    expect(crawlOutcome(report([entry({ storeId: 'flask', ok: false, error: 'x' })])).exitCode).toBe(1);
    expect(crawlOutcome(report([entry({ storeId: 'flask', ok: false, error: 'x' }), entry({ storeId: 'liquorcave' })])).exitCode).toBe(0);
  });

  it('escapes newlines and % in annotation data', () => {
    const out = crawlOutcome(report([entry({ storeId: 'a%b\nc', note: 'stopped: errors', stopReason: 'errors' })]));
    expect(out.annotations).toEqual(['::warning::a%25b%0Ac stopped: errors']);
  });
});
