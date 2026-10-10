import type { FetchFn } from '@/lib/shopify/client';

export async function sendTelegram(
  token: string,
  chatIds: string[],
  text: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  for (const chatId of chatIds) {
    let res: Response;
    try {
      res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });
    } catch {
      // Network errors may carry the request URL (and with it the token) in message/cause: never rethrow them.
      throw new Error('Telegram sendMessage failed: network');
    }
    if (!res.ok) {
      // Never include the token (it is in the URL) in the error.
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status}`);
    }
  }
}
