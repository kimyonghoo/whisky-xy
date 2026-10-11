import { notFound } from 'next/navigation';

/**
 * Unmatched paths under a locale ('/ko/xx/map'). With the root layout inside `[lang]`, Next's
 * built-in 404 would render without it; routing them here shows the localized `[lang]/not-found`
 * with a 404 status. (Kept synchronous: an `await connection()` here turns the status into 200.)
 */
export default function CatchAll(): never {
  notFound();
}

/** Always a 404: there is no page to validate for instant navigation. */
export const instant = false;
