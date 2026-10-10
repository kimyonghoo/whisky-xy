import { describe, expect, it, vi } from 'vitest';
import { sendTelegram } from '@/lib/alerts/telegram';

describe('sendTelegram', () => {
  it('posts to each chat', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await sendTelegram('TOK', ['1', '2'], 'hi', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botTOK/sendMessage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: '1', text: 'hi', parse_mode: 'HTML', disable_web_page_preview: false,
    });
  });
  it('throws on non-ok', async () => {
    const f = vi.fn(async () => new Response('no', { status: 400 }));
    await expect(sendTelegram('T', ['1'], 'x', f as unknown as typeof fetch)).rejects.toThrow();
  });
  it('network errors never leak the token-bearing URL (M4)', async () => {
    const f = vi.fn(async (url: string) => {
      throw new TypeError(`fetch failed: ${url}`, { cause: new Error(url) });
    });
    const err = await sendTelegram('SECRET-TOKEN', ['1'], 'x', f as unknown as typeof fetch).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Telegram sendMessage failed: network');
    expect(JSON.stringify(err) + String((err as Error).cause ?? '')).not.toContain('SECRET-TOKEN');
  });
});
