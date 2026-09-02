import {
  Body,
  Constellation,
  Elongation,
  Equator,
  EquatorFromVector,
  Horizon,
  Illumination,
  MakeTime,
  Observer,
  RotateVector,
  Rotation_EQD_EQJ,
  Rotation_HOR_EQD,
  Vector,
} from 'astronomy-engine';

import { BODY_MAP, BODY_PROFILES } from './constants';
import type { BodyKey, BodyState, GeoLocation, SkyPosition } from './types';

const AU_KM = 149597870.7;
const ARCSEC_PER_RAD = 206264.806;

export function toObserver(location: GeoLocation): Observer {
  return new Observer(location.lat, location.lon, location.elevation);
}

/** Pozycja dowolnego ciała Układu Słonecznego w układzie horyzontalnym i równikowym. */
export function positionOf(key: BodyKey, date: Date, observer: Observer): SkyPosition {
  const body = BODY_MAP[key];
  const eq = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return {
    ra: eq.ra,
    dec: eq.dec,
    azimuth: hor.azimuth,
    altitude: hor.altitude,
  };
}

/** Pozycja obiektu o stałych współrzędnych J2000, na przykład gwiazdy z katalogu. */
export function positionOfFixed(
  raHours: number,
  decDeg: number,
  date: Date,
  observer: Observer,
): SkyPosition {
  const hor = Horizon(date, observer, raHours, decDeg, 'normal');
  return { ra: raHours, dec: decDeg, azimuth: hor.azimuth, altitude: hor.altitude };
}

/** Pełny stan ciała: pozycja, jasność, odległość, faza, elongacja, gwiazdozbiór. */
export function bodyState(key: BodyKey, date: Date, observer: Observer): BodyState {
  const body = BODY_MAP[key];
  const profile = BODY_PROFILES[key];
  const position = positionOf(key, date, observer);

  const illum = Illumination(body, date);
  const distanceAu = illum.geo_dist;
  const distanceKm = distanceAu * AU_KM;

  /* Elongacja Słońca od samego siebie nie ma sensu, dla Słońca zwracamy zero. */
  let elongation = 0;
  if (key !== 'sun') {
    elongation = Elongation(body, date).elongation;
  }

  const angularSizeArcsec = (2 * profile.radiusKm * ARCSEC_PER_RAD) / distanceKm;

  /* Przynależność do gwiazdozbioru liczymy na współrzędnych J2000. */
  const eqJ2000 = Equator(body, date, observer, false, true);
  const constellation = Constellation(eqJ2000.ra, eqJ2000.dec).symbol;

  return {
    key,
    name: profile.name,
    position,
    magnitude: illum.mag,
    distanceAu,
    distanceKm,
    phaseFraction: illum.phase_fraction,
    phaseAngle: illum.phase_angle,
    elongation,
    angularSizeArcsec,
    constellation,
  };
}

/*
 * Zamiana wysokości i azymutu na współrzędne równikowe epoki J2000.
 *
 * Potrzebna dla obiektów, których położenie znamy wyłącznie względem horyzontu,
 * czyli w praktyce dla satelitów. Kolejność obrotów: układ horyzontalny do równika
 * daty, a stamtąd do równika J2000, bo cała reszta aplikacji operuje na J2000.
 *
 * Układ horyzontalny silnika ma oś x skierowaną na północ, y na zachód, z do zenitu.
 */
export function equatorialFromHorizon(
  azimuthDeg: number,
  altitudeDeg: number,
  date: Date,
  observer: Observer,
): { ra: number; dec: number } {
  const alt = (altitudeDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const cosAlt = Math.cos(alt);
  const time = MakeTime(date);
  const hor = new Vector(cosAlt * Math.cos(az), -cosAlt * Math.sin(az), Math.sin(alt), time);
  const eqd = RotateVector(Rotation_HOR_EQD(time, observer), hor);
  const eqj = RotateVector(Rotation_EQD_EQJ(time), eqd);
  const eq = EquatorFromVector(eqj);
  return { ra: eq.ra, dec: eq.dec };
}

/** Kątowa odległość dwóch punktów na sferze niebieskiej, w stopniach. */
export function angularSeparation(
  ra1Hours: number,
  dec1Deg: number,
  ra2Hours: number,
  dec2Deg: number,
): number {
  const d2r = Math.PI / 180;
  const ra1 = ra1Hours * 15 * d2r;
  const ra2 = ra2Hours * 15 * d2r;
  const dec1 = dec1Deg * d2r;
  const dec2 = dec2Deg * d2r;
  const cos =
    Math.sin(dec1) * Math.sin(dec2) + Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / d2r;
}

/** Gwiazdozbiór, w którym leży punkt o współrzędnych J2000. */
export function constellationAt(raHours: number, decDeg: number): { symbol: string; name: string } {
  const c = Constellation(raHours, decDeg);
  return { symbol: c.symbol, name: c.name };
}

export { Body };
