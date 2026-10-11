import { ChevronDown, MapPin } from 'lucide-react';
import type { FxRate } from '@/lib/db/schema';
import type { BottleGroup, CitySection } from '@/lib/search';
import { capGroups, nextShowCount, parseShowCount, searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { getCity, type CityId } from '@/lib/geo';
import { ko } from '@/lib/i18n/ko';
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

function GroupList({ groups, q, admin, now, fx }: ListProps & { groups: BottleGroup[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <BottleResult key={g.bottleKey} group={g} q={q} admin={admin} now={now} fx={fx} />
      ))}
    </div>
  );
}

/**
 * Results by city: the selected city first (`show` caps it), then every other live city of the
 * country as a collapsible block (`others` caps each). Others open when the selected city is empty.
 */
export function CitySections({
  sections,
  selected,
  raw,
  ...list
}: ListProps & { sections: CitySection[]; selected: CityId; raw: RawParams }) {
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
        <section aria-labelledby="city-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-bold tracking-[0.12em] text-primary">{ko.search.yourCity}</p>
            <SectionHeader
              id="city-h"
              icon={MapPin}
              title={ko.city[selected]}
              count={ko.search.bottlesCount(mine.groups.length)}
              sub={ko.search.citySub}
            />
          </div>
          {mine.groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-muted-foreground">{ko.search.sectionEmpty}</p>
          ) : (
            <GroupList groups={mineCap.visible} {...list} />
          )}
          {mineCap.hiddenCount > 0 && (
            <ShowMoreLink
              href={searchHref(raw, { show: String(nextShowCount(show, mine.groups.length)) })}
              label={ko.search.showMore(mineCap.hiddenCount)}
            />
          )}
        </section>
      )}

      {others.length > 0 && selectedCity && (
        <section aria-labelledby="elsewhere-h" className="flex flex-col gap-3">
          <h2 id="elsewhere-h" className="text-xs font-bold tracking-[0.12em] text-muted-foreground">
            {ko.search.elsewhere(ko.countryEn[selectedCity.country])}
          </h2>
          {others.map((sec) => {
            const cap = capGroups(sec.groups, othersShow);
            return (
              <details key={sec.city} open={othersOpen} className="group/city rounded-2xl border bg-muted/60">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-bold">{ko.city[sec.city]}</span>
                  <span className="text-sm text-muted-foreground tabular">
                    {ko.search.otherCitySummary(
                      sec.storeCount,
                      sec.bestAvailableCents !== null ? formatUsd(sec.bestAvailableCents) : null,
                    )}
                  </span>
                  <ChevronDown aria-hidden className="ml-auto size-4 transition-transform group-open/city:rotate-180" />
                </summary>
                <div className="flex flex-col gap-4 p-3 pt-1 sm:p-4 sm:pt-1">
                  <GroupList groups={cap.visible} {...list} />
                  {cap.hiddenCount > 0 && (
                    <ShowMoreLink
                      href={searchHref(raw, { others: String(nextShowCount(othersShow, sec.groups.length)) })}
                      label={ko.search.showMore(cap.hiddenCount)}
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
