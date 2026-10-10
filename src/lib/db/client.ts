import fs from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');
const DATA_DIR = path.join(process.cwd(), '.data');
const PGLITE_DIR = path.join(DATA_DIR, 'pglite');
// Outside the PGlite dir on purpose: PGlite's own postmaster.pid is a fake (-42) and
// is never checked, so two processes could otherwise open the same data dir.
const PGLITE_LOCK = path.join(DATA_DIR, 'pglite.lock');

interface DbState {
  promise?: Promise<Db>;
  close?: () => Promise<void>;
}

// Kept on globalThis so `next dev` HMR re-evaluating this module (or a second bundle
// copy of it) reuses the one open PGlite instead of opening a second writer on the
// same directory. Two writers on one data dir corrupt the WAL ("could not locate a
// valid checkpoint record").
const g = globalThis as typeof globalThis & { __whiskyDb?: DbState };
const state: DbState = (g.__whiskyDb ??= {});

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Cross-process guard for the local PGlite dir. Throws when another live process holds it. */
function acquireLock(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    fs.writeFileSync(PGLITE_LOCK, String(process.pid), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const holder = Number.parseInt(fs.readFileSync(PGLITE_LOCK, 'utf8').trim(), 10);
    if (Number.isInteger(holder) && holder !== process.pid && pidAlive(holder)) {
      throw new Error(
        `Local DB .data/pglite is already open in another process (pid ${holder}). ` +
          'Stop that process (Ctrl+C) first; two processes on one PGlite dir corrupt it. ' +
          'If no dev server or crawl is running (the pid was reused), delete .data/pglite.lock.',
      );
    }
    // Stale lock from a process that is gone: take it over.
    fs.writeFileSync(PGLITE_LOCK, String(process.pid));
  }
  process.once('exit', releaseLock);
}

function releaseLock(): void {
  try {
    if (fs.readFileSync(PGLITE_LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PGLITE_LOCK);
  } catch {
    // already gone
  }
}

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('postgres')) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { default: postgres } = await import('postgres');
    // prepare: false is required for the Supabase transaction pooler.
    const sqlClient = postgres(url, { prepare: false });
    state.close = () => sqlClient.end({ timeout: 5 });
    return drizzle(sqlClient, { schema }) as unknown as Db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  acquireLock();
  try {
    fs.mkdirSync(PGLITE_DIR, { recursive: true });
    const client = new PGlite(PGLITE_DIR);
    state.close = async () => {
      // close() runs Postgres' shutdown checkpoint, so the next open needs no recovery.
      if (!client.closed) await client.close();
      releaseLock();
    };
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return db as unknown as Db;
  } catch (err) {
    releaseLock();
    throw err;
  }
}

export function getDb(): Promise<Db> {
  state.promise ??= create().catch((err) => {
    state.promise = undefined;
    state.close = undefined;
    throw err;
  });
  return state.promise;
}

/** Cleanly close the shared DB (scripts call this before exiting). Safe to call twice. */
export async function closeDb(): Promise<void> {
  const close = state.close;
  state.promise = undefined;
  state.close = undefined;
  if (close) await close();
}

/**
 * For CLI scripts: run `main`, then close the DB before exiting, also on Ctrl+C / SIGTERM.
 * Never call bare process.exit() while PGlite is open.
 */
export function runScript(main: () => Promise<number>): void {
  let exiting = false;
  const finish = async (code: number) => {
    if (exiting) return;
    exiting = true;
    try {
      await closeDb();
    } catch (err) {
      console.error('closing DB failed:', err instanceof Error ? err.message : err);
    }
    process.exit(code);
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      console.error(`\n${sig}: closing DB before exit...`);
      void finish(130);
    });
  }
  main().then(
    (code) => finish(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      return finish(1);
    },
  );
}

export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}
