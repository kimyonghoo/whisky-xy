'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { endPour, isPageNavigation, startPour } from '@/lib/pour';

/**
 * The pour line along the bottom edge of the header. Starts on in-app link clicks and GET form
 * submits; programmatic navigations (city menu, search form) call `startPour` themselves. Ends when
 * the URL the router renders changes. Purely decorative: pages already mark their own busy state.
 */
export function PourProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    endPour();
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const info = { href: a.href, target: a.target, download: a.hasAttribute('download') };
      if (isPageNavigation(e, info, new URL(window.location.href))) startPour();
    }
    function onSubmit(e: SubmitEvent) {
      const form = e.target;
      // Forms that navigate through the router themselves (search) start and end their own pour.
      if (form instanceof HTMLFormElement && form.method === 'get' && !form.hasAttribute('data-pour-manual')) startPour();
    }
    // Capture phase: next/link calls preventDefault in its own handler, so bubbling would be too late to tell.
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  return <span aria-hidden className="pour-line" />;
}
