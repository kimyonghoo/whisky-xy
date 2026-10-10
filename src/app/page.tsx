import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { searchListings, type BottleGroup } from "@/lib/search";
import { parseSearchForm } from "@/lib/search-form";
import { ko } from "@/lib/i18n/ko";
import { REGION_LABEL } from "@/lib/stores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListingRowView } from "@/components/ListingRow";

type RawParams = Record<string, string | string[] | undefined>;

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function GroupCard({ group, q }: { group: BottleGroup; q: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          {group.imageUrl ? (
            // Hotlinked from the store CDN on purpose (never copied).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.imageUrl}
              alt={group.displayTitle}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-20 shrink-0 rounded-md bg-muted object-contain"
            />
          ) : (
            <div className="size-20 shrink-0 rounded-md bg-muted" aria-hidden />
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-base font-semibold leading-snug">{group.displayTitle}</h3>
            <div className="flex flex-wrap gap-1.5">
              {group.sizeMl != null && (
                <Badge variant="secondary" className="h-6 px-2.5 text-sm">
                  {group.sizeMl} ml
                </Badge>
              )}
              {group.proof != null && (
                <Badge variant="secondary" className="h-6 px-2.5 text-sm">
                  {group.proof} proof
                </Badge>
              )}
              {group.batch && (
                <Badge variant="secondary" className="h-6 px-2.5 text-sm">
                  {group.batch}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {group.rows.map((row) => (
            <ListingRowView key={row.id} row={row} bottleKey={group.bottleKey} q={q} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Section({ title, groups, q }: { title: string; groups: BottleGroup[]; q: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ko.search.sectionEmpty}</p>
      ) : (
        groups.map((g) => <GroupCard key={g.bottleKey} group={g} q={q} />)
      )}
    </section>
  );
}

export default function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 text-sm text-muted-foreground">
          {ko.loading}
        </main>
      }
    >
      <SearchView searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const params = parseSearchForm(raw);
  const hasQuery = params.q.length > 0;
  const { main, ca } = hasQuery
    ? await searchListings(await getDb(), params)
    : { main: [] as BottleGroup[], ca: [] as BottleGroup[] };
  const rawMin = typeof raw.min === "string" ? raw.min : "";
  const rawMax = typeof raw.max === "string" ? raw.max : "";
  const none = main.length === 0 && ca.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <form method="get" action="/" className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder={ko.search.placeholder}
            aria-label={ko.nav.search}
            className="h-10 text-base"
            autoFocus={!hasQuery}
          />
          <Button type="submit" className="h-10 px-5">
            {ko.search.submit}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {ko.search.regionLabel}
            <select name="region" defaultValue={params.region ?? ""} className={selectClass}>
              <option value="">{ko.search.regionAll}</option>
              <option value="brooklyn">{REGION_LABEL.brooklyn}</option>
              <option value="nj">{REGION_LABEL.nj}</option>
              <option value="ca">{REGION_LABEL.ca}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {ko.search.minLabel}
            <Input name="min" inputMode="decimal" defaultValue={rawMin} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {ko.search.maxLabel}
            <Input name="max" inputMode="decimal" defaultValue={rawMax} placeholder="500" />
          </label>
          <label className="flex items-end gap-2 pb-1.5 text-sm">
            <input
              type="checkbox"
              name="inStock"
              value="1"
              defaultChecked={params.inStockOnly}
              className="size-4 accent-emerald-600"
            />
            {ko.search.inStockOnly}
          </label>
        </div>
      </form>

      {!hasQuery ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-lg font-medium">{ko.search.emptyPrompt}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ko.search.emptyHint}</p>
        </div>
      ) : none ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-lg font-medium">{ko.search.noResults}</p>
        </div>
      ) : (
        <>
          {(main.length > 0 || params.region !== "ca") && (
            <Section title={ko.search.mainHeading} groups={main} q={params.q} />
          )}
          {ca.length > 0 && <Section title={ko.search.caHeading} groups={ca} q={params.q} />}
        </>
      )}
    </main>
  );
}
