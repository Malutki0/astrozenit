import { useEffect, useState } from 'react';

/*
 * Czy układ jest wąski, czyli czy nawigacja stoi na dole jako pasek zakładek,
 * a nie z boku jako szyna.
 *
 * Ten sam próg co w arkuszach stylów. Powielenie liczby w dwóch miejscach jest
 * tu ceną za to, że pasek zakładek i szyna pokazują różne zestawy pozycji,
 * a tego nie da się zrobić samym stylem: to różnica w treści, nie w wyglądzie.
 */
const PROG = '(max-width: 900px)';

export function useCompactLayout(): boolean {
  const [waski, setWaski] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(PROG).matches,
  );

  useEffect(() => {
    const pytanie = window.matchMedia(PROG);
    const reaguj = (e: MediaQueryListEvent) => setWaski(e.matches);
    pytanie.addEventListener('change', reaguj);
    setWaski(pytanie.matches);
    return () => pytanie.removeEventListener('change', reaguj);
  }, []);

  return waski;
}
