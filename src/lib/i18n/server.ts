// Server Components and server utilities only (next/root-params fails the build in client code).
// Server Actions cannot read root params: they take a whitelisted hidden `lang` field instead.
import { lang } from 'next/root-params';
import { notFound } from 'next/navigation';
import { dictFor, isLocale, type Dict, type Locale } from '@/lib/i18n';

/** The `[lang]` root param, whitelisted; anything else is a 404. */
export async function getLocale(): Promise<Locale> {
  const value: unknown = await lang();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDict(): Promise<Dict> {
  return dictFor(await getLocale());
}
