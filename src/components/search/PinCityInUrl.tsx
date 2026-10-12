'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { pinnedCitySearch } from '@/lib/city-cookie';
import type { CityId } from '@/lib/geo';

/**
 * Puts the city a results page was rendered for into the address bar when the URL didn't name it
 * (a cookie city, a store's city, a legacy `?region=`), so a copied link opens on that city
 * (spec §5.5). History only: Next syncs `useSearchParams` with no refetch, so the header agrees.
 */
export function PinCityInUrl({ city }: { city: CityId }) {
  const params = useSearchParams();
  useEffect(() => {
    const search = pinnedCitySearch(params.toString(), city);
    if (search === null) return;
    window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }, [params, city]);
  return null;
}
