import {
  Body,
  Equator,
  Libration,
  MoonPhase,
  NextMoonQuarter,
  Observer,
  SearchMoonPhase,
  SearchMoonQuarter,
} from 'astronomy-engine';

import { bodyState } from './ephemeris';
import type { MoonState } from './types';

const SYNODIC_DAYS = 29.530588853;
const DAY_MS = 86400000;
const D2R = Math.PI / 180;

export interface PhaseDescriptor {
  name: string;
  /** Klucz do rysowania ikony fazy. */
  key: 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';
}

/** Nazwa fazy na podstawie kąta fazowego w stopniach, gdzie 0 to nów. */
export function phaseDescriptor(phaseDeg: number): PhaseDescriptor {
  const p = ((phaseDeg % 360) + 360) % 360;
  if (p < 3 || p >= 357) return { name: 'Nów', key: 'new' };
  if (p < 87) return { name: 'Sierp przybywający', key: 'waxing-crescent' };
  if (p < 93) return { name: 'Pierwsza kwadra', key: 'first-quarter' };
  if (p < 177) return { name: 'Garb przybywający', key: 'waxing-gibbous' };
  if (p < 183) return { name: 'Pełnia', key: 'full' };
  if (p < 267) return { name: 'Garb ubywający', key: 'waning-gibbous' };
  if (p < 273) return { name: 'Ostatnia kwadra', key: 'last-quarter' };
  return { name: 'Sierp ubywający', key: 'waning-crescent' };
}

/** Ostatni nów przed podaną chwilą. Potrzebny do wyznaczenia wieku Księżyca. */
function lastNewMoon(date: Date): Date | null {
  let found = SearchMoonPhase(0, new Date(date.getTime() - 32 * DAY_MS), 33);
  if (!found) return null;
  for (;;) {
    const next = SearchMoonPhase(0, new Date(found.date.getTime() + 2 * DAY_MS), 33);
    if (!next || next.date > date) break;
    found = next;
  }
  return found.date <= date ? found.date : null;
}

/*
 * Kąt pozycyjny jasnego brzegu, liczony wzorem Meeusa.
 * Mówi, w którą stronę nieba zwrócony jest oświetlony rąbek tarczy,
 * dzięki czemu rysunek fazy zgadza się z rzeczywistym widokiem.
 */
function brightLimbAngle(date: Date, observer: Observer): number {
  const sun = Equator(Body.Sun, date, observer, true, true);
  const moon = Equator(Body.Moon, date, observer, true, true);
  const raSun = sun.ra * 15 * D2R;
  const decSun = sun.dec * D2R;
  const raMoon = moon.ra * 15 * D2R;
  const decMoon = moon.dec * D2R;
  const dRa = raSun - raMoon;
  const y = Math.cos(decSun) * Math.sin(dRa);
  const x = Math.sin(decSun) * Math.cos(decMoon) - Math.cos(decSun) * Math.sin(decMoon) * Math.cos(dRa);
  const chi = Math.atan2(y, x) / D2R;
  return (chi + 360) % 360;
}

export function moonState(date: Date, observer: Observer): MoonState {
  const base = bodyState('moon', date, observer);
  const phaseAngleDeg = MoonPhase(date);
  const lib = Libration(date);
  const newMoon = lastNewMoon(date);
  const ageDays = newMoon
    ? (date.getTime() - newMoon.getTime()) / DAY_MS
    : (phaseAngleDeg / 360) * SYNODIC_DAYS;

  return {
    ...base,
    distanceKm: lib.dist_km,
    angularSizeArcsec: lib.diam_deg * 3600,
    phaseAngleDeg,
    phaseName: phaseDescriptor(phaseAngleDeg).name,
    ageDays,
    waxing: phaseAngleDeg < 180,
    librationLat: lib.elat,
    librationLon: lib.elon,
    brightLimbAngle: brightLimbAngle(date, observer),
  };
}

export const QUARTER_NAMES = ['Nów', 'Pierwsza kwadra', 'Pełnia', 'Ostatnia kwadra'] as const;

export interface MoonQuarterEntry {
  quarter: 0 | 1 | 2 | 3;
  name: string;
  date: Date;
}

/** Kolejne kwadry począwszy od podanej chwili. */
export function nextQuarters(from: Date, count = 4): MoonQuarterEntry[] {
  const out: MoonQuarterEntry[] = [];
  let mq = SearchMoonQuarter(from);
  for (let i = 0; i < count; i++) {
    const quarter = mq.quarter as 0 | 1 | 2 | 3;
    out.push({ quarter, name: QUARTER_NAMES[quarter], date: mq.time.date });
    mq = NextMoonQuarter(mq);
  }
  return out;
}

/** Kwadry przypadające w danym miesiącu kalendarzowym. */
export function quartersInMonth(year: number, month: number): MoonQuarterEntry[] {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
  const out: MoonQuarterEntry[] = [];
  let mq = SearchMoonQuarter(start);
  while (mq.time.date < end) {
    const quarter = mq.quarter as 0 | 1 | 2 | 3;
    out.push({ quarter, name: QUARTER_NAMES[quarter], date: mq.time.date });
    mq = NextMoonQuarter(mq);
  }
  return out;
}

/** Ułamek oświetlenia tarczy w południe każdego dnia miesiąca, do siatki kalendarza. */
export function monthIllumination(year: number, month: number): { day: number; phase: number; fraction: number }[] {
  const out: { day: number; phase: number; fraction: number }[] = [];
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const d = new Date(year, month, day, 12, 0, 0, 0);
    const phase = MoonPhase(d);
    out.push({ day, phase, fraction: (1 - Math.cos(phase * D2R)) / 2 });
  }
  return out;
}
