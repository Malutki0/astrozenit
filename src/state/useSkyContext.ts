import { useMemo } from 'react';

import { positionOf, toObserver } from '@/lib/astro/ephemeris';
import { moonState } from '@/lib/astro/moon';
import { nightWindow } from '@/lib/astro/riseSet';
import type { CatalogBundle } from '@/lib/catalog/types';
import type { ResolveContext } from '@/lib/objects';
import { useSatelliteStore } from './useSatellites';
import { hourAt, useWeatherStore } from './useWeather';
import { useSkyStore } from './useSkyStore';

/*
 * Kontekst wspólny dla wszystkich sekcji.
 *
 * Okno nocy, stan Księżyca i wysokość Słońca są potrzebne przy każdej ocenie widoczności,
 * a ich policzenie kosztuje kilka milisekund, więc liczymy je raz i przekazujemy dalej.
 * Czas zaokrąglamy do pełnej minuty, żeby tykanie zegara nie unieważniało zapamiętanych
 * wyników sześćdziesiąt razy na minutę.
 *
 * Prognoza pogody dokłada się do tego samego kontekstu. Gdy jej nie ma, bo nie ma sieci
 * albo użytkownik ją wyłączył, ocena liczy się bez zachmurzenia i mówi o tym w interfejsie.
 */
export function useSkyContext(catalog: CatalogBundle): ResolveContext {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const report = useWeatherStore((s) => s.report);
  const satellites = useSatelliteStore((s) => s.set?.satellites);
  const minute = Math.floor(date.getTime() / 60000);
  /* Prognoza ma rozdzielczość godzinową, więc wystarczy jej klucz godzinowy. */
  const weatherKey = report ? `${report.fetchedAt}:${Math.floor(minute / 60)}` : 'brak';

  return useMemo(() => {
    const observer = toObserver(location);
    const at = new Date(minute * 60000);
    const moon = moonState(at, observer);
    const sun = positionOf('sun', at, observer);
    const hour = hourAt(report, at);
    return {
      catalog,
      date: at,
      location,
      night: nightWindow(observer, at),
      moon: {
        ra: moon.position.ra,
        dec: moon.position.dec,
        altitude: moon.position.altitude,
        illumination: moon.phaseFraction,
      },
      sunAltitude: sun.altitude,
      weather: hour ? { cloudCover: hour.cloudCover, visibility: hour.visibility } : null,
      satellites: satellites ?? [],
    };
    /* Zależność od minuty i klucza pogody, a nie od pełnych obiektów, jest tu celowa. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, location, minute, weatherKey, satellites]);
}
