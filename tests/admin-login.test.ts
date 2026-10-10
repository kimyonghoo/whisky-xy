import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string, opts: Record<string, unknown>) => jar.set(n, { value, opts }),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { loginAction, logoutAction } = await import('@/app/watchlist/actions');
const { ADMIN_COOKIE, LEGACY_ADMIN_COOKIE, WRONG_KEY_DELAY_MS, isAdmin } = await import('@/lib/admin');

const KEY = 'Zx9-' + 'a'.repeat(40);
const form = (key: string) => {
  const fd = new FormData();
  fd.set('key', key);
  return fd;
};

describe('loginAction / logoutAction', () => {
  const prevKey = process.env.ADMIN_KEY;
  beforeEach(() => {
    jar.clear();
    process.env.ADMIN_KEY = KEY;
  });
  afterEach(() => {
    process.env.ADMIN_KEY = prevKey;
  });

  it('sets a signed session (not the key) and clears the legacy raw-key cookie', async () => {
    expect(await loginAction({}, form(KEY))).toEqual({});
    const c = jar.get(ADMIN_COOKIE)!;
    expect(c.value).not.toContain(KEY);
    expect(isAdmin(c.value, KEY)).toBe(true);
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
    expect(jar.get(LEGACY_ADMIN_COOKIE)).toMatchObject({ value: '', opts: { maxAge: 0 } });
  });

  it('waits a fixed delay on a wrong key and sets no cookie', async () => {
    const t = Date.now();
    const r = await loginAction({}, form('wrong-key'));
    expect(Date.now() - t).toBeGreaterThanOrEqual(WRONG_KEY_DELAY_MS - 20);
    expect(r.error).toBeTruthy();
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
  });

  it('refuses even the right key when ADMIN_KEY is too short', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ADMIN_KEY = 'short';
    expect((await loginAction({}, form('short'))).error).toBeTruthy();
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
    err.mockRestore();
  });

  it('logout expires the session cookie with the same path/secure attributes', async () => {
    await loginAction({}, form(KEY));
    await logoutAction();
    expect(jar.get(ADMIN_COOKIE)).toMatchObject({ value: '', opts: { maxAge: 0, path: '/' } });
  });
});
