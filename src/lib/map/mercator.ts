/*
 * Odwzorowanie Merkatora w wersji używanej przez kafelkowe mapy internetowe.
 *
 * Świat jest kwadratem o boku jednego kafelka na powiększeniu zero. Każde kolejne
 * powiększenie dzieli każdy kafelek na cztery, więc na powiększeniu z bok świata
 * ma 2^z kafelków. Współrzędne kafelkowe są liczbami rzeczywistymi: część całkowita
 * wskazuje kafelek, ułamkowa położenie wewnątrz niego.
 *
 * Odwzorowanie nie sięga biegunów, bo szerokość dziewięćdziesiąt stopni odwzorowuje się
 * w nieskończoność. Granicą jest w przybliżeniu 85.05 stopnia i tam przycinamy zakres.
 */

export const MAX_LATITUDE = 85.05112878;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Długość geograficzna na współrzędną kafelkową x. */
export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

/** Szerokość geograficzna na współrzędną kafelkową y. */
export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * D2R;
  return (
    ((1 - Math.log(Math.tan(clamped) + 1 / Math.cos(clamped)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function tileXToLon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return R2D * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Ile metrów przypada na piksel na danej szerokości i powiększeniu.
 * Potrzebne do podziałki, bo w odwzorowaniu Merkatora skala rośnie z szerokością.
 */
export function metersPerPixel(lat: number, zoom: number, tileSize = 256): number {
  const equator = 40075016.686;
  return (equator * Math.cos(lat * D2R)) / (tileSize * Math.pow(2, zoom));
}

/** Odległość dwóch punktów na powierzchni Ziemi w kilometrach, wzorem haversine. */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
