// What `npm run crawl` prints for GitHub Actions and how it exits. Pure: no I/O.
import type { CrawlReport } from '@/lib/crawl/run';
import type { CrawlStopReason } from '@/lib/pagecrawl/fetcher';

/** Stops worth a look but not a failed run: they are not persisted, so the next run tries again. */
const WARN_STOPS: readonly CrawlStopReason[] = ['http-503', 'robots-unavailable', 'errors', 'deadline', 'crawl-delay'];

/** Workflow-command data escaping (`%`, CR, LF), so a value can never end or forge an annotation. */
const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/**
 * Annotations and exit code of a finished run:
 * - a block detected this run: `::error title=Store blocked::<store> <reason>`, and exit 1;
 * - a store skipped for an earlier block, or for the run budget: `::warning::`;
 * - a 503, robots-unavailable, errors, deadline or crawl-delay stop: `::warning::`;
 * - as before, exit 1 when every store failed.
 */
export function crawlOutcome(report: CrawlReport): { annotations: string[]; exitCode: number } {
  const annotations: string[] = [];
  let blocked = false;
  for (const s of report.stores) {
    const id = esc(s.storeId);
    if (s.block?.detected) {
      blocked = true;
      annotations.push(`::error title=Store blocked::${id} ${esc(s.block.reason)}`);
    } else if (s.block) {
      annotations.push(
        `::warning::${id} ${esc(s.note ?? `skipped: blocked since ${s.block.since} (${s.block.reason})`)}; ` +
          `after checking the store, clear with npm run crawl:unblock -- --store ${id}`,
      );
    } else if (s.stopReason && WARN_STOPS.includes(s.stopReason)) {
      annotations.push(`::warning::${id} stopped: ${s.stopReason}`);
    } else if (s.note === 'skipped: run budget exhausted') {
      annotations.push(`::warning::${id} ${s.note}`);
    }
  }
  const allFailed = report.stores.every((s) => !s.ok);
  return { annotations, exitCode: blocked || allFailed ? 1 : 0 };
}
