'use client';

import { useLinkStatus } from 'next/link';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/components/LocaleLink';

function Indicator() {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
  ) : (
    <ChevronDown aria-hidden />
  );
}

/** "더 보기" for a capped result section. Keeps scroll position; shows progress while loading. */
export function ShowMoreLink({ href, label }: { href: string; label: string }) {
  return (
    <LocaleLink href={href} scroll={false} prefetch={false} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full sm:w-auto sm:self-center sm:px-8' })}>
      <Indicator />
      {label}
    </LocaleLink>
  );
}
