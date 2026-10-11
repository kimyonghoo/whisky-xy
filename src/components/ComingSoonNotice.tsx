import { ArrowRight } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { buttonVariants } from '@/components/ui/button';
import { searchHref } from '@/lib/search-view';
import type { City } from '@/lib/geo';

/**
 * Shown instead of results for a city whose stores are not tracked yet: a calm, finished-looking
 * announcement (never an empty result), with a way back to the visitor's live city.
 */
export async function ComingSoonNotice({ city, backCity }: { city: City; backCity: City }) {
  const d = await getDict();
  return (
    <section aria-labelledby="soon-h" className="flex flex-col items-center gap-5 border-y px-4 py-14 text-center sm:py-20">
      <p lang="en" className="text-[0.6875rem] tracking-[0.3em] text-primary">
        {d.soon.eyebrow} · {d.countryEn[city.country]}
      </p>
      <h2 id="soon-h" className="flex flex-col items-center gap-2 font-serif font-medium">
        <span className="text-[2rem] leading-tight sm:text-[2.5rem]">{d.city[city.id]}</span>
        <span className="text-lg text-muted-foreground sm:text-xl">{d.soon.title}</span>
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[0.9375rem]">{d.soon.body(d.city[city.id])}</p>
      <LocaleLink href={searchHref({}, { city: backCity.id })} className={buttonVariants({ variant: 'default', size: 'lg', className: 'mt-2' })}>
        {d.soon.back(d.city[backCity.id])}
        <ArrowRight aria-hidden />
      </LocaleLink>
    </section>
  );
}
