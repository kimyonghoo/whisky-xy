import Link from 'next/link';
import { ko } from '@/lib/i18n/ko';
import { buttonVariants } from '@/components/ui/button';

export default function CardNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">{ko.card.notFoundTitle}</h1>
      <p className="text-lg text-muted-foreground">{ko.card.notFoundHint}</p>
      <Link href="/" className={buttonVariants({ className: 'h-14 px-8 text-lg' })}>
        {ko.card.backToSearch}
      </Link>
    </main>
  );
}
