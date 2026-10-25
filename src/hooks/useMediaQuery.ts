/**
 * Does the viewport match a media query right now?
 *
 * The settings panel is a static column on desktop and a slide-in sheet on
 * phones. Behaviours that depend on which of those two it is — `inert` on a
 * closed sheet, for one — cannot be expressed with CSS alone, so components
 * ask this hook instead of guessing from a resize listener.
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
