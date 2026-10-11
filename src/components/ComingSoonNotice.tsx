import Link from 'next/link';
import { ko } from '@/lib/i18n/ko';
import { searchHref } from '@/lib/search-view';
import type { City } from '@/lib/geo';

/** Shown instead of results for a city whose stores are not tracked yet. Styled in the visual pass. */
export function ComingSoonNotice({ city, backCity }: { city: City; backCity: City }) {
  return (
    <section aria-labelledby="soon-h" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-semibold text-primary">{ko.soon.eyebrow}</p>
      <h2 id="soon-h" className="text-xl font-bold tracking-tight">
        {ko.soon.title}
      </h2>
      <p className="text-muted-foreground">{ko.soon.body(ko.city[city.id])}</p>
      <Link href={searchHref({}, { city: backCity.id })} className="font-semibold text-primary underline underline-offset-4">
        {ko.soon.back(ko.city[backCity.id])}
      </Link>
    </section>
  );
}
