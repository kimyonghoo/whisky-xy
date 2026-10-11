'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, dictFor, type Dict, type Locale } from '@/lib/i18n';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Makes the page locale available to Client Components. Takes the locale, not the dictionary:
 * dictionaries hold formatter functions, which cannot cross the server→client boundary as props.
 * Outside a provider (unit tests) the default locale applies.
 */
export function DictProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDict(): Dict {
  return dictFor(useLocale());
}
