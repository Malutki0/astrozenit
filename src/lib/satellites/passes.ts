/*
 * Przewidywanie przelotów.
 *
 * Przelot to odcinek czasu, w którym satelita jest nad horyzontem. Widoczny przelot
 * wymaga jednak trzech rzeczy naraz, i to trzecia jest tą, o której najłatwiej zapomnieć:
 *
 *   1. satelita nad horyzontem,
 *   2. satelita oświetlony przez Słońce, czyli poza cieniem Ziemi,
 *   3. obserwator w ciemności, czyli Słońce co najmniej sześć stopni pod horyzontem.
 *
 * Dlatego widoczne przeloty zdarzają się głównie w godzinie po zmierzchu i przed świtem:
 * na dole jest już ciemno, a na wysokości czterystu kilometrów wciąż świeci Słońce.
 *
 * Szukanie: przemiatamy czas z krokiem trzydziestu sekund, bo przelot na niskiej orbicie
 * trwa kilka minut, a przy dłuższym kroku dałoby się przeoczyć krótkie przejście nisko
 * nad horyzontem. Granice przelotu zawężamy potem przeszukiwaniem połówkowym.
 */

import { positionOf } from '@/lib/astro/ephemeris';
import type { Observer } from 'astronomy-engine';

import { familyOf } from './catalog';
import { fixFor, sunDirection, type ObserverGeodetic } from './propagate';
import type { SatelliteFix, SatelliteRecord, SatellitePass } from './types';

/*
 * Krok wstępnego skanowania nieba, w milisekundach.
 *
 * Przelot satelity niskoorbitalnego nad horyzontem trwa od sześciu do jedenastu minut,
 * więc próbkowanie co minutę łapie każdy z nich, i to z zapasem sześciu próbek na
 * najkrótszy przypadek. Dokładne chwile wejścia i wyjścia i tak wyznacza późniejsze
 * zawężanie przedziału, a nie ten krok, więc zagęszczanie skanu nie poprawiłoby
 * wyniku, a podwajało koszt: przy dwudziestu siedmiu obiektach i dobie zapasu
 * to różnica między jedną trzecią sekundy a dwiema trzecimi.
 */
const STEP_MS = 60_000;

/** Chwila przejścia przez horyzont, znajdowana połowieniem przedziału. */
function refineCrossing(
  record: SatelliteRecord,
  observer: ObserverGeodetic,
  below: number,
  above: number,
): Date {
  let lo = below;
  let hi = above;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const fix = fixFor(record, new Date(mid), observer);
    if (!fix) break;
    if (fix.altitude >= 0) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}

export interface PassOptions {
  /** Najmniejsza wysokość górowania, poniżej której przelot nie jest wart pokazania. */
  minPeakAltitude?: number;
  /** Ile godzin naprzód szukamy. */
  hours?: number;
  /** Czy pomijać przeloty niewidoczne, czyli w cieniu Ziemi albo za dnia. */
  onlyVisible?: boolean;
}

export function findPasses(
  record: SatelliteRecord,
  from: Date,
  observer: ObserverGeodetic,
  astro: Observer,
  options: PassOptions = {},
): SatellitePass[] {
  const { minPeakAltitude = 10, hours = 48, onlyVisible = true } = options;
  const end = from.getTime() + hours * 3600_000;

  const passes: SatellitePass[] = [];
  let inPass = false;
  let entryBelow = 0;
  let samples: { t: number; fix: SatelliteFix; darkEnough: boolean }[] = [];

  const finish = (exitAbove: number, exitBelow: number) => {
    if (samples.length === 0) return;
    let peak = samples[0];
    for (const s of samples) if (s.fix.altitude > peak.fix.altitude) peak = s;
    if (peak.fix.altitude < minPeakAltitude) {
      samples = [];
      return;
    }

    /* Przelot uznajemy za widoczny, jeśli choć jedna próbka spełnia wszystkie trzy warunki. */
    const visibleSamples = samples.filter((s) => s.fix.sunlit && s.darkEnough);
    const visible = visibleSamples.length > 0;
    if (onlyVisible && !visible) {
      samples = [];
      return;
    }

    const pool = visible ? visibleSamples : samples;
    let brightest: number | null = null;
    for (const s of pool) {
      if (s.fix.magnitude === null) continue;
      if (brightest === null || s.fix.magnitude < brightest) brightest = s.fix.magnitude;
    }

    const start = refineCrossing(record, observer, entryBelow, samples[0].t);
    const stop = refineCrossing(record, observer, exitBelow, exitAbove);

    passes.push({
      id: record.id,
      name: record.name,
      label: record.label,
      start,
      peak: new Date(peak.t),
      end: stop,
      maxAltitude: peak.fix.altitude,
      peakAzimuth: peak.fix.azimuth,
      startAzimuth: samples[0].fix.azimuth,
      endAzimuth: samples[samples.length - 1].fix.azimuth,
      magnitude: brightest,
      visible,
    });
    samples = [];
  };

  /* Wysokość Słońca zmienia się wolno, więc liczymy ją co dziesięć minut i przechowujemy. */
  const sunCache = new Map<number, number>();
  const sunAltitudeAt = (t: number): number => {
    const key = Math.floor(t / 600_000);
    const cached = sunCache.get(key);
    if (cached !== undefined) return cached;
    const alt = positionOf('sun', new Date(key * 600_000), astro).altitude;
    sunCache.set(key, alt);
    return alt;
  };

  let previous = from.getTime();
  for (let t = from.getTime(); t <= end; t += STEP_MS) {
    const date = new Date(t);
    const fix = fixFor(record, date, observer, sunDirection(date));
    if (!fix) return passes;

    if (fix.altitude >= 0) {
      if (!inPass) {
        inPass = true;
        entryBelow = previous;
        samples = [];
      }
      samples.push({ t, fix, darkEnough: sunAltitudeAt(t) < -6 });
    } else if (inPass) {
      inPass = false;
      finish(previous, t);
    }
    previous = t;
  }
  if (inPass) finish(previous, previous + STEP_MS);

  return passes;
}

/*
 * Przeloty wielu satelitów naraz.
 *
 * Liczba obiektów w grupie "visual" przekracza sto pięćdziesiąt, a każdy z nich wymaga
 * kilku tysięcy wywołań modelu SGP4 na dobę. Dlatego przeloty liczymy tylko dla obiektów
 * wskazanych przez wywołującego, a nie dla całego katalogu.
 */
export function findPassesFor(
  records: SatelliteRecord[],
  from: Date,
  observer: ObserverGeodetic,
  astro: Observer,
  options: PassOptions = {},
): SatellitePass[] {
  const all: SatellitePass[] = [];
  for (const record of records) all.push(...findPasses(record, from, observer, astro, options));
  return mergePasses(all);
}

/**
 * Porządkuje i scala listę przelotów.
 *
 * Wydzielone z findPassesFor, żeby dało się liczyć przeloty porcjami, po kilka
 * obiektów naraz, i scalić dopiero na końcu. Liczenie wszystkiego w jednym wywołaniu
 * zajmuje na telefonie ponad sekundę i przez ten czas strona nie odpowiada na dotyk.
 */
export function mergePasses(all: SatellitePass[]): SatellitePass[] {
  all.sort((a, b) => a.start.getTime() - b.start.getTime());

  /*
   * Sklejanie przelotów jednej stacji.
   *
   * Moduły tej samej stacji lecą po praktycznie tej samej orbicie, więc dają ten sam
   * przelot pod kilkoma nazwami. Z nakładających się przelotów jednej rodziny zostawiamy
   * jeden: ten z podaną jasnością, a przy równych z wyższym górowaniem.
   */
  const out: SatellitePass[] = [];
  for (const pass of all) {
    const family = familyOf(pass.name);
    if (!family) {
      out.push(pass);
      continue;
    }
    const twin = out.find(
      (p) =>
        familyOf(p.name) === family &&
        pass.start.getTime() < p.end.getTime() + 120_000 &&
        p.start.getTime() < pass.end.getTime() + 120_000,
    );
    if (!twin) {
      out.push(pass);
      continue;
    }
    const better =
      (twin.magnitude === null && pass.magnitude !== null) ||
      (twin.magnitude !== null &&
        pass.magnitude !== null &&
        pass.maxAltitude > twin.maxAltitude);
    if (better) out[out.indexOf(twin)] = pass;
  }
  return out;
}
