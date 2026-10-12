'use client';

import { useSearchParams } from 'next/navigation';
import { resolveCity, type City } from '@/lib/geo';
import type { Dict } from '@/lib/i18n';
import { useDict } from '@/lib/i18n/client';

/**
 * The compact form of `ComingSoonNotice`, for pages whose content doesn't change by city: picking a
 * coming-soon city there still says so on that screen (spec §5.5) instead of only changing the header.
 */
export function ComingSoonCompactView({ city, d }: { city: City; d: Dict }) {
  return (
    <section aria-labelledby="soon-compact-h" className="flex flex-col gap-1.5 rounded-lg border px-4 py-3.5 sm:px-5">
      <p lang="en" className="text-[0.6875rem] tracking-[0.3em] text-primary">
        {d.soon.eyebrow} · {d.countryEn[city.country]}
      </p>
      <h2 id="soon-compact-h" className="font-serif text-base font-medium">
        {d.city[city.id]} <span className="text-muted-foreground">· {d.soon.title}</span>
      </h2>
      <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{d.soon.pageNote}</p>
    </section>
  );
}

/** Renders the compact notice when the URL's `?city=` is a coming-soon city; nothing otherwise. */
export function ComingSoonForUrlCity() {
  const d = useDict();
  const params = useSearchParams();
  const raw = params.get('city');
  if (!raw) return null;
  const { city, soon } = resolveCity({ city: raw });
  return soon ? <ComingSoonCompactView city={city} d={d} /> : null;
}
