import { create } from 'zustand';

import { loadSatellites } from '@/lib/satellites/catalog';
import type { SatelliteRecord, SatelliteSet } from '@/lib/satellites/types';

/*
 * Zestaw elementów orbitalnych.
 *
 * Pobierany dopiero wtedy, gdy jest potrzebny: przy włączeniu warstwy satelitów albo
 * przy wejściu do sekcji. Mapa nieba ma działać bez sieci, więc nie może pobierać
 * czegokolwiek przy starcie tylko dlatego, że ta funkcja istnieje.
 */

interface SatelliteState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  set: SatelliteSet | null;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

let inFlight: AbortController | null = null;

export const useSatelliteStore = create<SatelliteState>((set, get) => ({
  status: 'idle',
  set: null,
  error: null,

  load: async (force = false) => {
    const state = get();
    if (!force && (state.status === 'loading' || state.status === 'ready')) return;

    inFlight?.abort();
    inFlight = new AbortController();
    set({ status: 'loading', error: null });
    try {
      const data = await loadSatellites(force, inFlight.signal);
      set({ set: data, status: 'ready', error: null });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      set({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać elementów orbitalnych satelitów.',
      });
    }
  },
}));

const EMPTY: SatelliteRecord[] = [];

/** Lista satelitów dla warstwy mapy. Stała referencja, gdy danych nie ma. */
export const useSatelliteRecords = (): SatelliteRecord[] =>
  useSatelliteStore((s) => s.set?.satellites ?? EMPTY);

/** Wiek zestawu w godzinach. Powyżej kilku dni przewidywania przelotów tracą minutową dokładność. */
export function setAgeHours(set: SatelliteSet | null): number | null {
  if (!set) return null;
  return (Date.now() - set.fetchedAt) / 3600_000;
}
