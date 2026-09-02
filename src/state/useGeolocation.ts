import { useCallback, useState } from 'react';

import type { GeoLocation } from '@/lib/astro/types';
import {
  DEFAULT_BORTLE,
  loadLocations,
  nearestLocation,
  type LocationEntry,
} from '@/lib/catalog/locations';
import { useSkyStore } from './useSkyStore';

export type GeolocationStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unavailable' | 'error';

const MESSAGES: Record<GeolocationStatus, string> = {
  idle: '',
  pending: 'Ustalam położenie...',
  granted: 'Lokalizacja ustalona.',
  denied: 'Odmówiono dostępu do lokalizacji. Wybierz miejsce z listy albo wpisz współrzędne.',
  unavailable: 'Ta przeglądarka nie udostępnia geolokalizacji.',
  error: 'Nie udało się ustalić położenia. Wybierz miejsce z listy.',
};

/**
 * Pobiera położenie użytkownika na jego wyraźne żądanie.
 * Nie pytamy o zgodę automatycznie przy starcie, bo to nachalne i obniża zaufanie.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const setLocation = useSkyStore((s) => s.setLocation);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('pending');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(4));
        const lon = Number(position.coords.longitude.toFixed(4));
        /* Skalę Bortle'a odczytujemy z najbliższego znanego miejsca w bazie.
         * Jeśli nic nie ma w promieniu kilkudziesięciu kilometrów, zostaje wartość domyślna. */
        const entries = await loadLocations().catch(() => [] as LocationEntry[]);
        const near = nearestLocation(entries, lat, lon);
        const next: GeoLocation = {
          lat,
          lon,
          elevation: Math.round(position.coords.altitude ?? near?.elevation ?? 100),
          label: near ? `Twoje położenie, w pobliżu: ${near.name}` : 'Twoje położenie',
          source: 'geolocation',
          bortle: near?.bortle ?? DEFAULT_BORTLE,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
          region: near?.region ?? null,
        };
        setLocation(next);
        setStatus('granted');
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  }, [setLocation]);

  return { status, message: MESSAGES[status], request };
}
