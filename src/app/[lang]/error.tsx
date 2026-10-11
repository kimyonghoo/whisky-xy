'use client';

import { useEffect } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useDict } from '@/lib/i18n/client';
import { LocaleLink } from '@/components/LocaleLink';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const d = useDict();
  useEffect(() => {
    // Only the digest is logged; server error details are never shown to users.
    console.error('page error', error.digest ?? '');
  }, [error]);

  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState as="h1" icon={CircleAlert} title={d.error.title} description={d.error.hint}>
        <Button size="lg" onClick={() => retry()}>
          <RefreshCw aria-hidden />
          {d.error.retry}
        </Button>
        <LocaleLink href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {d.card.backToSearch}
        </LocaleLink>
      </EmptyState>
    </main>
  );
}
