import { useMemo } from 'react';

import { toObserver } from '@/lib/astro/ephemeris';
import { nightWindow, startOfLocalDay } from '@/lib/astro/riseSet';
import type { GeoLocation, NightWindow } from '@/lib/astro/types';

/**
 * Klucz nocy, do której należy podana chwila.
 *
 * Noc traktujemy jako odcinek od południa do południa, więc druga w nocy należy
 * jeszcze do nocy poprzedniego dnia. Dzięki temu przewijanie czasu przez północ
 * nie powoduje przeskoku wszystkich godzin zachodu i wschodu.
 */
export function nightKey(date: Date): number {
  const anchor = startOfLocalDay(date);
  if (date.getHours() < 12) anchor.setTime(anchor.getTime() - 86400000);
  return anchor.getTime();
}

/*
 * Okno nocy zmienia się raz na dobę, a jego policzenie wymaga kilku wyszukiwań
 * momentu, w którym Słońce mija zadaną wysokość. Zapamiętujemy je więc po kluczu
 * nocy i lokalizacji, a nie po dokładnej chwili. Bez tego każde tyknięcie zegara
 * przeliczało wszystko od nowa.
 */
export function useNightWindow(location: GeoLocation, date: Date): NightWindow {
  const key = nightKey(date);
  return useMemo(
    () => nightWindow(toObserver(location), new Date(key + 22 * 3600000)),
    [location, key],
  );
}
