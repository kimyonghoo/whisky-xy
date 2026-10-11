import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { searchHref } from '@/lib/search-view';
import type { City } from '@/lib/geo';

/** Shown instead of results for a city whose stores are not tracked yet. Styled in the visual pass. */
export async function ComingSoonNotice({ city, backCity }: { city: City; backCity: City }) {
  const d = await getDict();
  return (
    <section aria-labelledby="soon-h" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-semibold text-primary">{d.soon.eyebrow}</p>
      <h2 id="soon-h" className="text-xl font-bold tracking-tight">
        {d.soon.title}
      </h2>
      <p className="text-muted-foreground">{d.soon.body(d.city[city.id])}</p>
      <LocaleLink href={searchHref({}, { city: backCity.id })} className="font-semibold text-primary underline underline-offset-4">
        {d.soon.back(d.city[backCity.id])}
      </LocaleLink>
    </section>
  );
}
