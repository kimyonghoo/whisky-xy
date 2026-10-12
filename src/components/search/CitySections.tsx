import { ChevronDown, MapPin } from 'lucide-react';
import type { FxRate } from '@/lib/db/schema';
import type { BottleGroup, CitySection } from '@/lib/search';
import { capGroups, nextShowCount, parseShowCount, searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { getCity, type CityId } from '@/lib/geo';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { BottleResult } from '@/components/BottleResult';
import { SectionHeader } from '@/components/SectionHeader';
import { ShowMoreLink } from '@/components/search/ShowMoreLink';

type RawParams = Record<string, string | string[] | undefined>;

interface ListProps {
  q: string;
  admin: boolean;
  now: Date;
  fx: FxRate | null;
}

function GroupList({ groups, q, admin, now, fx, city, d }: ListProps & { groups: BottleGroup[]; city: CityId; d: Dict }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <BottleResult key={g.bottleKey} group={g} q={q} admin={admin} now={now} fx={fx} city={city} d={d} />
      ))}
    </div>
  );
}

/**
 * Results by city: the selected city first (`show` caps it), then every other live city of the
 * country as a collapsible block (`others` caps each). Others open when the selected city is empty.
 */
export async function CitySections({
  sections,
  selected,
  raw,
  ...list
}: ListProps & { sections: CitySection[]; selected: CityId; raw: RawParams }) {
  const d = await getDict();
  const mine = sections.find((s) => s.city === selected);
  const others = sections.filter((s) => s.city !== selected);
  const selectedCity = getCity(selected);
  const show = parseShowCount(raw.show);
  const othersShow = parseShowCount(raw.others);
  const mineCap = mine ? capGroups(mine.groups, show) : null;
  const othersOpen = !mine || mine.groups.length === 0 || raw.others !== undefined;

  return (
    <>
      {mine && selectedCity && mineCap && (
        <section aria-labelledby="city-h" className="flex flex-col gap-4 border-t pt-5">
          <div className="flex flex-col gap-1.5">
            <p lang="en" className="text-[0.6875rem] tracking-[0.3em] text-primary">
              {d.search.yourCity}
            </p>
            <SectionHeader
              id="city-h"
              icon={MapPin}
              title={d.city[selected]}
              count={d.search.bottlesCount(mine.groups.length)}
              sub={d.search.citySub}
            />
          </div>
          {mine.groups.length === 0 ? (
            <p className="rounded-lg border px-4 py-6 text-center text-muted-foreground">{d.search.sectionEmpty}</p>
          ) : (
            <GroupList groups={mineCap.visible} {...list} city={selected} d={d} />
          )}
          {mineCap.hiddenCount > 0 && (
            <ShowMoreLink
              href={searchHref(raw, { show: String(nextShowCount(show, mine.groups.length)) })}
              label={d.search.showMore(mineCap.hiddenCount)}
            />
          )}
        </section>
      )}

      {others.length > 0 && selectedCity && (
        <section aria-labelledby="elsewhere-h" className="flex flex-col gap-3 border-t pt-5">
          <h2 id="elsewhere-h" lang="en" className="text-[0.6875rem] font-normal tracking-[0.3em] text-muted-foreground">
            {d.search.elsewhere(d.countryEn[selectedCity.country])}
          </h2>
          {others.map((sec) => {
            const cap = capGroups(sec.groups, othersShow);
            return (
              <details key={sec.city} open={othersOpen} className="group/city rounded-md border">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-4 py-3 transition-colors hover:bg-muted/60">
                  <span className="font-serif font-medium">{d.city[sec.city]}</span>
                  <span className="text-sm text-muted-foreground tabular">
                    {d.search.otherCitySummary(
                      sec.inStockStoreCount,
                      sec.storeCount,
                      sec.bestAvailableCents !== null ? formatUsd(sec.bestAvailableCents) : null,
                    )}
                  </span>
                  <ChevronDown aria-hidden className="ml-auto size-4 text-primary transition-transform group-open/city:rotate-180" />
                </summary>
                <div className="flex flex-col gap-4 p-3 pt-1 sm:p-4 sm:pt-1">
                  <GroupList groups={cap.visible} {...list} city={selected} d={d} />
                  {cap.hiddenCount > 0 && (
                    <ShowMoreLink
                      href={searchHref(raw, { others: String(nextShowCount(othersShow, sec.groups.length)) })}
                      label={d.search.showMore(cap.hiddenCount)}
                    />
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </>
  );
}
