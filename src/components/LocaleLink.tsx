'use client';

import Link from 'next/link';
import { localizePath } from '@/lib/i18n';
import { useLocale } from '@/lib/i18n/client';

type Props = Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string };

/** `next/link` with the current locale prefixed: callers pass unprefixed paths ('/map', '/?q=…'). */
export function LocaleLink({ href, ...rest }: Props) {
  return <Link href={localizePath(useLocale(), href)} {...rest} />;
}
