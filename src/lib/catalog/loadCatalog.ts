import type {
  Asterism,
  Boundaries,
  CatalogBundle,
  ConstellationRecord,
  DeepSkyObject,
  NamedStar,
  StarCatalog,
} from './types';

const MAGIC = 0x5a4e5331; // "ZNS1"

/**
 * Dekoduje katalog gwiazd z formatu binarnego.
 * Układ pliku: cztery bajty sygnatury, liczba gwiazd, a potem pięć równoległych tablic.
 * Przesunięcia są tak dobrane, żeby każda tablica startowała pod właściwym wyrównaniem.
 */
function decodeStars(buffer: ArrayBuffer): StarCatalog {
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== MAGIC) {
    throw new Error('Nieprawidłowa sygnatura pliku katalogu gwiazd.');
  }
  const count = view.getUint32(4, true);

  const raRaw = new Float32Array(buffer, 8, count);
  const decRaw = new Float32Array(buffer, 8 + count * 4, count);
  const magRaw = new Int16Array(buffer, 8 + count * 8, count);
  const ciRaw = new Int16Array(buffer, 8 + count * 10, count);
  const hip = new Int32Array(buffer, 8 + count * 12, count);

  const mag = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  const ex = new Float32Array(count);
  const ey = new Float32Array(count);
  const ez = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    mag[i] = magRaw[i] / 100;
    colorIndex[i] = ciRaw[i] === -32768 ? NaN : ciRaw[i] / 1000;
    const cosDec = Math.cos(decRaw[i]);
    ex[i] = cosDec * Math.cos(raRaw[i]);
    ey[i] = cosDec * Math.sin(raRaw[i]);
    ez[i] = Math.sin(decRaw[i]);
  }

  return { count, ra: raRaw, dec: decRaw, mag, colorIndex, hip, ex, ey, ez };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nie udało się wczytać ${url}: ${res.status}`);
  return (await res.json()) as T;
}

let cached: Promise<CatalogBundle> | null = null;

/** Wczytuje komplet danych katalogowych. Kolejne wywołania korzystają z tej samej obietnicy. */
export function loadCatalog(base = '/data'): Promise<CatalogBundle> {
  if (cached) return cached;

  cached = (async () => {
    const [starsBuffer, named, constellations, dso, asterisms, boundaries] = await Promise.all([
      fetch(`${base}/stars.bin`).then((r) => {
        if (!r.ok) throw new Error(`Nie udało się wczytać katalogu gwiazd: ${r.status}`);
        return r.arrayBuffer();
      }),
      fetchJson<NamedStar[]>(`${base}/stars-named.json`),
      fetchJson<ConstellationRecord[]>(`${base}/constellations.json`),
      fetchJson<DeepSkyObject[]>(`${base}/dso.json`),
      fetchJson<Asterism[]>(`${base}/asterisms.json`),
      fetchJson<Boundaries>(`${base}/boundaries.json`),
    ]);

    const stars = decodeStars(starsBuffer);
    const namedByHip = new Map<number, NamedStar>();
    for (const s of named) {
      if (s.hip) namedByHip.set(s.hip, s);
    }

    return { stars, named, namedByHip, constellations, dso, asterisms, boundaries };
  })();

  return cached;
}

/** Wyłącznie na potrzeby testów: usuwa zapamiętany katalog. */
export function resetCatalogCache(): void {
  cached = null;
}
