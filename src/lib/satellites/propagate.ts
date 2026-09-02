/*
 * Położenie satelity na niebie.
 *
 * Model SGP4 z biblioteki satellite.js, wywoływany na elementach z Celestraku. Sam model
 * daje położenie w układzie związanym z Ziemią; zamiana na wysokość i azymut dla obserwatora
 * to już zwykła geometria.
 *
 * Dwie rzeczy wymagają uwagi i obie decydują o tym, czy satelita jest w ogóle widoczny:
 *
 *   Oświetlenie. Satelita świeci wyłącznie odbitym światłem Słońca, więc w cieniu Ziemi
 *   znika, nawet stojąc wysoko nad horyzontem. Dlatego przy każdym położeniu sprawdzamy,
 *   czy obiekt jest w cieniu, modelem walca: rzutujemy jego położenie na kierunek do Słońca
 *   i pytamy, czy leży za Ziemią i bliżej osi niż promień Ziemi.
 *
 *   Jasność. Zależy od odległości i od kąta fazowego, dokładnie tak jak u planet.
 *   Ten sam satelita potrafi być gwiazdą pierwszej wielkości nad głową i niewidoczny
 *   przy horyzoncie.
 */

import { Body, GeoVector, Rotation_EQJ_EQD, RotateVector } from 'astronomy-engine';
import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js';

import type { SatelliteFix, SatelliteRecord } from './types';

const EARTH_RADIUS_KM = 6378.14;
const AU_KM = 149597870.7;
const R2D = 180 / Math.PI;

/** Zapamiętane wyniki rozbioru elementów. Rozbiór jest kosztowny, a elementy zmieniają się rzadko. */
const recCache = new Map<string, SatRec | null>();

function satrecFor(record: SatelliteRecord): SatRec | null {
  const key = `${record.line1}|${record.line2}`;
  const cached = recCache.get(key);
  if (cached !== undefined) return cached;
  let rec: SatRec | null = null;
  try {
    rec = twoline2satrec(record.line1, record.line2);
    /* Niezerowy kod błędu oznacza elementy, których model nie umie użyć. */
    if (rec.error) rec = null;
  } catch {
    rec = null;
  }
  recCache.set(key, rec);
  return rec;
}

export interface ObserverGeodetic {
  /** Szerokość geograficzna w stopniach. */
  lat: number;
  /** Długość geograficzna w stopniach. */
  lon: number;
  /** Wysokość nad poziomem morza w metrach. */
  elevation: number;
}

/**
 * Kierunek do Słońca w układzie równika daty, znormalizowany.
 * Ten sam wektor służy wszystkim satelitom w danej chwili, więc liczymy go raz.
 */
export function sunDirection(date: Date): { x: number; y: number; z: number } {
  const eqj = GeoVector(Body.Sun, date, false);
  const eqd = RotateVector(Rotation_EQJ_EQD(date), eqj);
  const len = Math.hypot(eqd.x, eqd.y, eqd.z) || 1;
  return { x: eqd.x / len, y: eqd.y / len, z: eqd.z / len };
}

/**
 * Czy punkt o zadanym położeniu jest oświetlony przez Słońce.
 * Model walcowy: pomijamy półcień, bo dla satelity różnica dotyczy kilku sekund przelotu.
 */
function isSunlit(pos: { x: number; y: number; z: number }, sun: { x: number; y: number; z: number }): boolean {
  const along = pos.x * sun.x + pos.y * sun.y + pos.z * sun.z;
  /* Po stronie Słońca cień nie sięga. */
  if (along > 0) return true;
  const perpX = pos.x - along * sun.x;
  const perpY = pos.y - along * sun.y;
  const perpZ = pos.z - along * sun.z;
  return Math.hypot(perpX, perpY, perpZ) > EARTH_RADIUS_KM;
}

/*
 * Jasność wizualna satelity.
 *
 * Wzór standardowy dla obserwacji wizualnych: jasność podana dla tysiąca kilometrów
 * i połowy tarczy koryguje się o rzeczywistą odległość i o funkcję fazową kuli
 * rozpraszającej światło. Satelity nie są kulami, więc jest to przybliżenie,
 * ale oddaje rząd wielkości i różnicę między przelotem nad głową a przy horyzoncie.
 */
function apparentMagnitude(
  standard: number,
  rangeKm: number,
  phaseAngleRad: number,
): number {
  const phaseFunction =
    ((Math.PI - phaseAngleRad) * Math.cos(phaseAngleRad) + Math.sin(phaseAngleRad)) / Math.PI;
  const safe = Math.max(1e-4, phaseFunction);
  return standard + 5 * Math.log10(rangeKm / 1000) - 2.5 * Math.log10(safe);
}

/** Położenie jednego satelity na niebie obserwatora. Wartość pusta oznacza elementy nie do użycia. */
export function fixFor(
  record: SatelliteRecord,
  date: Date,
  observer: ObserverGeodetic,
  sun?: { x: number; y: number; z: number },
): SatelliteFix | null {
  const rec = satrecFor(record);
  if (!rec) return null;

  let result;
  try {
    result = propagate(rec, date);
  } catch {
    return null;
  }
  if (!result?.position || typeof result.position === 'boolean') return null;

  const gmst = gstime(date);
  const eci = result.position as { x: number; y: number; z: number };
  const geodetic = eciToGeodetic(eci, gmst);
  const look = ecfToLookAngles(
    {
      latitude: degreesToRadians(observer.lat),
      longitude: degreesToRadians(observer.lon),
      height: observer.elevation / 1000,
    },
    eciToEcf(eci, gmst),
  );

  const sunVec = sun ?? sunDirection(date);
  const sunlit = isSunlit(eci, sunVec);

  let magnitude: number | null = null;
  if (record.standardMagnitude !== null) {
    /*
     * Kąt fazowy liczymy między kierunkiem od satelity do Słońca a kierunkiem
     * od satelity do obserwatora. Wektor do obserwatora przybliżamy wektorem
     * do środka Ziemi, bo satelita jest setki razy dalej od Słońca niż od nas
     * i różnica jest w tym rachunku nieistotna.
     */
    const len = Math.hypot(eci.x, eci.y, eci.z) || 1;
    const toEarth = { x: -eci.x / len, y: -eci.y / len, z: -eci.z / len };
    const cosPhase = Math.max(
      -1,
      Math.min(1, toEarth.x * sunVec.x + toEarth.y * sunVec.y + toEarth.z * sunVec.z),
    );
    magnitude = apparentMagnitude(record.standardMagnitude, look.rangeSat, Math.acos(cosPhase));
  }

  return {
    id: record.id,
    name: record.name,
    label: record.label,
    altitude: look.elevation * R2D,
    azimuth: (look.azimuth * R2D + 360) % 360,
    height: geodetic.height,
    range: look.rangeSat,
    sunlit,
    magnitude,
  };
}

/** Położenia wszystkich satelitów w danej chwili. Obiekty pod horyzontem są pomijane. */
export function fixesAbove(
  records: SatelliteRecord[],
  date: Date,
  observer: ObserverGeodetic,
  minAltitude = 0,
): SatelliteFix[] {
  const sun = sunDirection(date);
  const out: SatelliteFix[] = [];
  for (const record of records) {
    const fix = fixFor(record, date, observer, sun);
    if (fix && fix.altitude >= minAltitude) out.push(fix);
  }
  return out.sort((a, b) => b.altitude - a.altitude);
}

export { AU_KM };
