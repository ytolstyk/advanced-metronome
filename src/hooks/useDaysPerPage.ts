import { useEffect, useState } from 'react';

/** Days shown side by side at a width that fits them (a week), and on a phone. */
export const WIDE_DAYS_PER_PAGE = 7;
export const NARROW_DAYS_PER_PAGE = 3;
const WIDE_QUERY = '(min-width: 640px)';

/** How many day columns fit: a week on a tablet or desktop, three on a phone. */
export function useDaysPerPage(): number {
  const canMatch = typeof window.matchMedia === 'function';
  const [wide, setWide] = useState(() => (canMatch ? window.matchMedia(WIDE_QUERY).matches : true));
  useEffect(() => {
    if (!canMatch) return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [canMatch]);
  return wide ? WIDE_DAYS_PER_PAGE : NARROW_DAYS_PER_PAGE;
}
