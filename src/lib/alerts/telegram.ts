import type { FetchFn } from '@/lib/shopify/client';

export async function sendTelegram(
  token: string,
  chatIds: string[],
  text: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  for (const chatId of chatIds) {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      // Never include the token (it is in the URL) in the error.
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status}`);
    }
  }
}
