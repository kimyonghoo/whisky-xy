import Link from 'next/link';
import { Search, SearchX } from 'lucide-react';
import { ko } from '@/lib/i18n/ko';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export default function CardNotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState as="h1" icon={SearchX} title={ko.card.notFoundTitle} description={ko.card.notFoundHint}>
        <Link href="/" className={buttonVariants({ size: 'xl' })}>
          <Search aria-hidden />
          {ko.card.backToSearch}
        </Link>
      </EmptyState>
    </main>
  );
}
