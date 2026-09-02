/*
 * Domyślna implementacja dostawcy danych: obliczenia w całości po stronie przeglądarki,
 * na bazie biblioteki astronomy-engine. Działa bez sieci i bez klucza API.
 *
 * Wyniki są zapamiętywane w pamięci podręcznej, bo panele wielokrotnie pytają o te same
 * wartości dla tej samej chwili i lokalizacji. Klucz cache zaokrągla czas do pełnej minuty,
 * co przy dokładności prezentowanych danych jest w zupełności wystarczające.
 */

import { generateEvents } from './events';
import { bodyState, toObserver } from './ephemeris';
import { moonState } from './moon';
import { nightWindow, riseSetOf, riseSetOfFixed, startOfLocalDay } from './riseSet';
import type { EphemerisProvider, SkyPointQuery } from './provider';
import type {
  AstroEvent,
  BodyKey,
  BodyState,
  GeoLocation,
  MoonState,
  NightWindow,
  RiseSetTimes,
} from './types';

const MAX_ENTRIES = 400;

class Cache {
  private map = new Map<string, unknown>();

  get<T>(key: string, produce: () => T): T {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit as T;
    const value = produce();
    if (this.map.size >= MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
    return value;
  }

  clear(): void {
    this.map.clear();
  }
}

const minuteKey = (d: Date) => Math.floor(d.getTime() / 60000);
const dayKey = (d: Date) => startOfLocalDay(d).getTime();
const locKey = (l: GeoLocation) => `${l.lat.toFixed(3)},${l.lon.toFixed(3)},${Math.round(l.elevation)}`;

export class LocalEphemerisProvider implements EphemerisProvider {
  readonly id = 'local-astronomy-engine';
  readonly label = 'Obliczenia lokalne, astronomy-engine';
  readonly offline = true;

  private cache = new Cache();

  async getBodyState(key: BodyKey, date: Date, location: GeoLocation): Promise<BodyState> {
    return this.cache.get(`body:${key}:${minuteKey(date)}:${locKey(location)}`, () =>
      bodyState(key, date, toObserver(location)),
    );
  }

  async getMoonState(date: Date, location: GeoLocation): Promise<MoonState> {
    return this.cache.get(`moon:${minuteKey(date)}:${locKey(location)}`, () =>
      moonState(date, toObserver(location)),
    );
  }

  async getRiseSet(key: BodyKey, date: Date, location: GeoLocation): Promise<RiseSetTimes> {
    return this.cache.get(`rise:${key}:${dayKey(date)}:${locKey(location)}`, () =>
      riseSetOf(key, toObserver(location), startOfLocalDay(date)),
    );
  }

  async getRiseSetForPoint(
    point: SkyPointQuery,
    date: Date,
    location: GeoLocation,
  ): Promise<RiseSetTimes> {
    const id = `${point.ra.toFixed(4)}:${point.dec.toFixed(4)}`;
    return this.cache.get(`risePoint:${id}:${dayKey(date)}:${locKey(location)}`, () =>
      riseSetOfFixed(
        point.ra,
        point.dec,
        toObserver(location),
        startOfLocalDay(date),
        point.distanceLightYears ?? 1000,
      ),
    );
  }

  async getNightWindow(date: Date, location: GeoLocation): Promise<NightWindow> {
    /* Okno nocy zmienia się powoli, więc wystarczy klucz dobowy z podziałem na połowę doby. */
    const half = date.getHours() < 12 ? 'am' : 'pm';
    return this.cache.get(`night:${dayKey(date)}:${half}:${locKey(location)}`, () =>
      nightWindow(toObserver(location), date),
    );
  }

  async getEvents(from: Date, to: Date, location: GeoLocation): Promise<AstroEvent[]> {
    return this.cache.get(
      `events:${from.getTime()}:${to.getTime()}:${locKey(location)}`,
      () => generateEvents(from, to, toObserver(location)),
    );
  }

  /** Czyści pamięć podręczną, na przykład po zmianie lokalizacji. */
  reset(): void {
    this.cache.clear();
  }
}

export const localProvider = new LocalEphemerisProvider();
