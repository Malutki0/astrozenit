import { create } from 'zustand';

import { weatherProvider } from '@/lib/weather/openMeteo';
import type { CloudGrid, WeatherHour, WeatherReport } from '@/lib/weather/types';

import { useSkyStore } from './useSkyStore';

/*
 * Pogoda dla miejsca obserwacji.
 *
 * Prognoza jest jedyną częścią aplikacji, która wymaga sieci. Wszystko inne liczy się
 * na miejscu, więc brak połączenia nie może niczego zepsuć: przy błędzie ocena warunków
 * wraca do trybu bez chmur i mówi o tym wprost, zamiast udawać, że nic się nie stało.
 *
 * Odpowiedź trzymamy w pamięci trwałej przez pół godziny. Modele pogodowe i tak
 * odświeżają się co godzinę, więc częstsze pytanie to obciążanie cudzego serwera bez powodu.
 */

const CACHE_KEY = 'zenit:pogoda';
const GRID_KEY = 'zenit:pogoda-siatka';
const TTL_MS = 30 * 60 * 1000;

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WeatherState {
  status: WeatherStatus;
  report: WeatherReport | null;
  grid: CloudGrid | null;
  gridStatus: WeatherStatus;
  error: string | null;
  /** Czy użytkownik wyłączył pobieranie pogody. */
  enabled: boolean;
  load: (lat: number, lon: number, force?: boolean) => Promise<void>;
  loadGrid: (lat: number, lon: number, force?: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
}

/* Klucz z zaokrąglonymi współrzędnymi: przesunięcie o kilometr nie zmienia prognozy. */
const keyFor = (prefix: string, lat: number, lon: number) =>
  `${prefix}:${lat.toFixed(2)}:${lon.toFixed(2)}`;

function readCache<T extends { fetchedAt: number }>(key: string, revive: (raw: T) => T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return revive(parsed);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Brak miejsca w pamięci nie może przerwać działania aplikacji. */
  }
}

const reviveReport = (raw: WeatherReport): WeatherReport => ({
  ...raw,
  hours: raw.hours.map((h) => ({ ...h, time: new Date(h.time) })),
});

const reviveGrid = (raw: CloudGrid): CloudGrid => ({ ...raw, start: new Date(raw.start) });

let inFlight: AbortController | null = null;
let gridInFlight: AbortController | null = null;

export const useWeatherStore = create<WeatherState>((set, get) => ({
  status: 'idle',
  report: null,
  grid: null,
  gridStatus: 'idle',
  error: null,
  enabled: (() => {
    try {
      return localStorage.getItem('zenit:pogoda-wylaczona') !== '1';
    } catch {
      return true;
    }
  })(),

  setEnabled: (enabled) => {
    try {
      if (enabled) localStorage.removeItem('zenit:pogoda-wylaczona');
      else localStorage.setItem('zenit:pogoda-wylaczona', '1');
    } catch {
      /* Bez pamięci ustawienie działa tylko do przeładowania. */
    }
    set(enabled ? { enabled } : { enabled, report: null, grid: null, status: 'idle', gridStatus: 'idle' });
  },

  load: async (lat, lon, force = false) => {
    if (!get().enabled) return;
    const key = keyFor(CACHE_KEY, lat, lon);

    if (!force) {
      const cached = readCache<WeatherReport>(key, reviveReport);
      if (cached) {
        set({ report: cached, status: 'ready', error: null });
        return;
      }
    }

    inFlight?.abort();
    inFlight = new AbortController();
    set({ status: 'loading', error: null });
    try {
      const report = await weatherProvider.fetchReport(lat, lon, inFlight.signal);
      writeCache(key, report);
      set({ report, status: 'ready', error: null });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      set({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać prognozy. Ocena warunków pomija zachmurzenie.',
      });
    }
  },

  loadGrid: async (lat, lon, force = false) => {
    if (!get().enabled) return;
    const key = keyFor(GRID_KEY, lat, lon);

    if (!force) {
      const cached = readCache<CloudGrid>(key, reviveGrid);
      if (cached) {
        set({ grid: cached, gridStatus: 'ready' });
        return;
      }
    }

    gridInFlight?.abort();
    gridInFlight = new AbortController();
    set({ gridStatus: 'loading' });
    try {
      const grid = await weatherProvider.fetchCloudGrid(lat, lon, gridInFlight.signal);
      writeCache(key, grid);
      set({ grid, gridStatus: 'ready' });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      set({ gridStatus: 'error' });
    }
  },
}));

/* Zmiana miejsca obserwacji unieważnia prognozę, bo pogoda jest lokalna. */
let lastKey = '';
useSkyStore.subscribe((state) => {
  const key = keyFor('miejsce', state.location.lat, state.location.lon);
  if (key === lastKey) return;
  lastKey = key;
  void useWeatherStore.getState().load(state.location.lat, state.location.lon);
});

/*
 * Pierwsze pobranie.
 *
 * Wywoływane z powłoki aplikacji, a nie przy imporcie modułu, żeby zapytanie do sieci
 * było skutkiem uruchomienia aplikacji, a nie ubocznym efektem wczytania pliku.
 */
export function startWeather(): void {
  const { location } = useSkyStore.getState();
  lastKey = keyFor('miejsce', location.lat, location.lon);
  void useWeatherStore.getState().load(location.lat, location.lon);
}

/** Godzina prognozy najbliższa zadanej chwili. Zwraca wartość pustą, gdy prognoza nie sięga tak daleko. */
export function hourAt(report: WeatherReport | null, date: Date): WeatherHour | null {
  if (!report || report.hours.length === 0) return null;
  const target = date.getTime();
  const first = report.hours[0].time.getTime();
  const last = report.hours[report.hours.length - 1].time.getTime();
  /* Poza zakresem prognozy nie zgadujemy: lepiej powiedzieć, że nie wiadomo. */
  if (target < first - 3600_000 || target > last + 3600_000) return null;

  let best = report.hours[0];
  let bestDiff = Math.abs(target - first);
  for (const hour of report.hours) {
    const diff = Math.abs(target - hour.time.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = hour;
    }
  }
  return best;
}

export const useWeatherHour = (date: Date): WeatherHour | null => {
  const report = useWeatherStore((s) => s.report);
  return hourAt(report, date);
};
