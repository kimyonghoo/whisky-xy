'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { ko } from '@/lib/i18n/ko';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Only the digest is logged; server error details are never shown to users.
    console.error('page error', error.digest ?? '');
  }, [error]);

  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState as="h1" icon={CircleAlert} title={ko.error.title} description={ko.error.hint}>
        <Button size="lg" onClick={() => retry()}>
          <RefreshCw aria-hidden />
          {ko.error.retry}
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {ko.card.backToSearch}
        </Link>
      </EmptyState>
    </main>
  );
}
