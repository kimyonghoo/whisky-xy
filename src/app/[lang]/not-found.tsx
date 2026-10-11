import { Compass, Search } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export default async function NotFound() {
  const d = await getDict();
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState as="h1" icon={Compass} title={d.notFound.title} description={d.notFound.hint}>
        <LocaleLink href="/" className={buttonVariants({ size: 'xl' })}>
          <Search aria-hidden />
          {d.card.backToSearch}
        </LocaleLink>
      </EmptyState>
    </main>
  );
}
