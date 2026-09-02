import { Observer, Rotation_EQJ_HOR } from 'astronomy-engine';
import type { StarCatalog } from './types';

/**
 * Bufor pozycji horyzontalnych całego katalogu.
 * Układ współrzędnych jest zgodny z konwencją silnika efemeryd:
 * x wskazuje północ, y zachód, z zenit.
 */
export interface HorizontalBuffer {
  /** Składowa północna wektora jednostkowego. */
  n: Float32Array;
  /** Składowa zachodnia wektora jednostkowego. */
  w: Float32Array;
  /** Składowa zenitalna wektora jednostkowego. Dodatnia oznacza obiekt nad horyzontem. */
  u: Float32Array;
}

export function createHorizontalBuffer(count: number): HorizontalBuffer {
  return { n: new Float32Array(count), w: new Float32Array(count), u: new Float32Array(count) };
}

/** Macierz obrotu z układu równikowego J2000 do horyzontalnego, spłaszczona do dziewięciu liczb. */
export type SkyRotation = Float64Array;

/*
 * Silnik zwraca pełną macierz obrotu uwzględniającą precesję, nutację, czas gwiazdowy
 * i położenie obserwatora. Spłaszczamy ją raz, żeby pętla po gwiazdach nie sięgała
 * do tablic zagnieżdżonych.
 *
 * Konwencja mnożenia w silniku: out.x = rot[0][0] x + rot[1][0] y + rot[2][0] z.
 */
export function skyRotation(date: Date, observer: Observer): SkyRotation {
  const r = Rotation_EQJ_HOR(date, observer).rot;
  const m = new Float64Array(9);
  m[0] = r[0][0];
  m[1] = r[1][0];
  m[2] = r[2][0];
  m[3] = r[0][1];
  m[4] = r[1][1];
  m[5] = r[2][1];
  m[6] = r[0][2];
  m[7] = r[1][2];
  m[8] = r[2][2];
  return m;
}

/**
 * Przelicza cały katalog do układu horyzontalnego.
 *
 * Koszt: dziewięć mnożeń i sześć dodawań na gwiazdę, bez ani jednej funkcji trygonometrycznej,
 * bo cała trygonometria siedzi już w macierzy obrotu. Dla dziewięciu tysięcy gwiazd
 * to ułamek milisekundy, więc możemy wywoływać to przy każdej zmianie czasu lub lokalizacji,
 * ale nigdy przy przesuwaniu czy przybliżaniu mapy, które ruszają wyłącznie projekcję.
 */
export function projectCatalogToHorizon(
  catalog: StarCatalog,
  rotation: SkyRotation,
  out: HorizontalBuffer,
): void {
  const { ex, ey, ez, count } = catalog;
  const m0 = rotation[0];
  const m1 = rotation[1];
  const m2 = rotation[2];
  const m3 = rotation[3];
  const m4 = rotation[4];
  const m5 = rotation[5];
  const m6 = rotation[6];
  const m7 = rotation[7];
  const m8 = rotation[8];
  const { n, w, u } = out;

  for (let i = 0; i < count; i++) {
    const x = ex[i];
    const y = ey[i];
    const z = ez[i];
    n[i] = m0 * x + m1 * y + m2 * z;
    w[i] = m3 * x + m4 * y + m5 * z;
    u[i] = m6 * x + m7 * y + m8 * z;
  }
}

/** Przelicza pojedynczy punkt o współrzędnych J2000 do wektora horyzontalnego. */
export function pointToHorizon(
  raHours: number,
  decDeg: number,
  rotation: SkyRotation,
): { n: number; w: number; u: number } {
  const ra = raHours * 15 * (Math.PI / 180);
  const dec = decDeg * (Math.PI / 180);
  const cosDec = Math.cos(dec);
  const x = cosDec * Math.cos(ra);
  const y = cosDec * Math.sin(ra);
  const z = Math.sin(dec);
  return {
    n: rotation[0] * x + rotation[1] * y + rotation[2] * z,
    w: rotation[3] * x + rotation[4] * y + rotation[5] * z,
    u: rotation[6] * x + rotation[7] * y + rotation[8] * z,
  };
}

/** Zamienia wektor horyzontalny na azymut i wysokość w stopniach. */
export function vectorToAltAz(n: number, w: number, u: number): { azimuth: number; altitude: number } {
  const R2D = 180 / Math.PI;
  const altitude = Math.asin(Math.max(-1, Math.min(1, u))) * R2D;
  /* Azymut liczymy zgodnie z ruchem wskazówek zegara od północy, więc wschód to plus 90 stopni. */
  let azimuth = Math.atan2(-w, n) * R2D;
  if (azimuth < 0) azimuth += 360;
  return { azimuth, altitude };
}

/** Zamienia azymut i wysokość w stopniach na wektor horyzontalny. */
export function altAzToVector(azimuthDeg: number, altitudeDeg: number): { n: number; w: number; u: number } {
  const D2R = Math.PI / 180;
  const az = azimuthDeg * D2R;
  const alt = altitudeDeg * D2R;
  const cosAlt = Math.cos(alt);
  return { n: cosAlt * Math.cos(az), w: -cosAlt * Math.sin(az), u: Math.sin(alt) };
}
