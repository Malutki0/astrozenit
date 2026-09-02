import {
  Body,
  DefineStar,
  Observer,
  SearchAltitude,
  SearchHourAngle,
  SearchRiseSet,
} from 'astronomy-engine';

import { BODY_MAP } from './constants';
import type { BodyKey, NightWindow, RiseSetTimes, TwilightPhase } from './types';
import { positionOf, positionOfFixed } from './ephemeris';

/** Początek doby lokalnej dla podanego momentu. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function riseSetFor(body: Body, observer: Observer, from: Date): RiseSetTimes {
  const rise = SearchRiseSet(body, observer, +1, from, 1);
  const set = SearchRiseSet(body, observer, -1, from, 1);
  const transit = SearchHourAngle(body, observer, 0, from, +1);

  const transitAltitude = transit ? transit.hor.altitude : null;
  const circumpolar = !rise && !set && transitAltitude !== null && transitAltitude > 0;
  const neverRises = !rise && !set && transitAltitude !== null && transitAltitude <= 0;

  return {
    rise: rise ? rise.date : null,
    set: set ? set.date : null,
    transit: transit ? transit.time.date : null,
    transitAltitude,
    circumpolar,
    neverRises,
  };
}

/** Wschód, górowanie i zachód ciała Układu Słonecznego w ciągu doby od podanego momentu. */
export function riseSetOf(key: BodyKey, observer: Observer, from: Date): RiseSetTimes {
  return riseSetFor(BODY_MAP[key], observer, from);
}

/*
 * Silnik pozwala zdefiniować do ośmiu obiektów o stałych współrzędnych.
 * Używamy jednego gniazda rotacyjnie, bo liczymy zawsze pojedynczy obiekt naraz.
 */
export function riseSetOfFixed(
  raHours: number,
  decDeg: number,
  observer: Observer,
  from: Date,
  distanceLightYears = 1000,
): RiseSetTimes {
  DefineStar(Body.Star1, raHours, decDeg, Math.max(1, distanceLightYears));
  return riseSetFor(Body.Star1, observer, from);
}

/** Wysokość obiektu o stałych współrzędnych w kolejnych chwilach, do wykresu. */
export function altitudeCurve(
  raHours: number,
  decDeg: number,
  observer: Observer,
  from: Date,
  to: Date,
  steps = 48,
): { time: Date; altitude: number }[] {
  const out: { time: Date; altitude: number }[] = [];
  const span = to.getTime() - from.getTime();
  if (span <= 0) return out;
  for (let i = 0; i <= steps; i++) {
    const time = new Date(from.getTime() + (span * i) / steps);
    out.push({ time, altitude: positionOfFixed(raHours, decDeg, time, observer).altitude });
  }
  return out;
}

/** Wysokość ciała Układu Słonecznego w kolejnych chwilach, do wykresu. */
export function bodyAltitudeCurve(
  key: BodyKey,
  observer: Observer,
  from: Date,
  to: Date,
  steps = 48,
): { time: Date; altitude: number }[] {
  const out: { time: Date; altitude: number }[] = [];
  const span = to.getTime() - from.getTime();
  if (span <= 0) return out;
  for (let i = 0; i <= steps; i++) {
    const time = new Date(from.getTime() + (span * i) / steps);
    out.push({ time, altitude: positionOf(key, time, observer).altitude });
  }
  return out;
}

function twilightPhaseFor(sunAltitude: number): TwilightPhase {
  if (sunAltitude > -0.833) return 'day';
  if (sunAltitude > -6) return 'civil';
  if (sunAltitude > -12) return 'nautical';
  if (sunAltitude > -18) return 'astronomical';
  return 'night';
}

/*
 * Okno nocy liczone od południa lokalnego, żeby zawsze objąć jedną, spójną noc,
 * a nie dwa oderwane fragmenty z początku i końca doby kalendarzowej.
 */
export function nightWindow(observer: Observer, date: Date): NightWindow {
  const noon = startOfLocalDay(date);
  noon.setHours(12, 0, 0, 0);
  /* Jeśli pytamy o wczesny ranek, interesuje nas noc, która wtedy właśnie trwa. */
  const anchor = date.getHours() < 12 ? new Date(noon.getTime() - 24 * 3600 * 1000) : noon;

  const at = (dir: 1 | -1, alt: number) => {
    const t = SearchAltitude(Body.Sun, observer, dir, anchor, 2, alt);
    return t ? t.date : null;
  };

  const sunset = at(-1, -0.833);
  const sunrise = at(+1, -0.833);
  const civilDusk = at(-1, -6);
  const civilDawn = at(+1, -6);
  const nauticalDusk = at(-1, -12);
  const nauticalDawn = at(+1, -12);
  const astronomicalDusk = at(-1, -18);
  const astronomicalDawn = at(+1, -18);

  const darkMinutes =
    astronomicalDusk && astronomicalDawn && astronomicalDawn > astronomicalDusk
      ? Math.round((astronomicalDawn.getTime() - astronomicalDusk.getTime()) / 60000)
      : null;

  const sunAltitude = positionOf('sun', date, observer).altitude;

  return {
    sunset,
    sunrise,
    civilDusk,
    civilDawn,
    nauticalDusk,
    nauticalDawn,
    astronomicalDusk,
    astronomicalDawn,
    phase: twilightPhaseFor(sunAltitude),
    darkMinutes,
  };
}

export const TWILIGHT_LABELS: Record<TwilightPhase, string> = {
  day: 'dzień',
  civil: 'zmierzch cywilny',
  nautical: 'zmierzch żeglarski',
  astronomical: 'zmierzch astronomiczny',
  night: 'noc astronomiczna',
};
