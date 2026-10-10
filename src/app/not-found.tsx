import Link from 'next/link';
import { Compass, Search } from 'lucide-react';
import { ko } from '@/lib/i18n/ko';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState as="h1" icon={Compass} title={ko.notFound.title} description={ko.notFound.hint}>
        <Link href="/" className={buttonVariants({ size: 'xl' })}>
          <Search aria-hidden />
          {ko.card.backToSearch}
        </Link>
      </EmptyState>
    </main>
  );
}
