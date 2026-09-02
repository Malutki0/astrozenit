import type { GeoLocation } from '@/lib/astro/types';

/*
 * Baza miejsc obserwacji.
 *
 * Dane pochodzą z GeoNames (nazwy, współrzędne, liczba mieszkańców, strefa czasowa)
 * oraz ze Stellarium (stopień zanieczyszczenia nieba światłem w skali Bortle'a).
 * Plik jest wczytywany dopiero przy pierwszym otwarciu wyszukiwarki, żeby nie
 * obciążać startu aplikacji.
 */

/** Zwarty rekord w postaci, w jakiej trzymany jest w pliku danych. */
interface RawLocation {
  n: string;
  r: string | null;
  c: string | null;
  la: number;
  lo: number;
  e: number;
  b: number | null;
  t: string | null;
  k: 'city' | 'capital' | 'observatory';
  p: number;
  f: string;
}

export interface LocationEntry {
  name: string;
  /** Kraj po polsku, pusty dla miejsc w Polsce. */
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
  elevation: number;
  /** Stopień zanieczyszczenia nieba światłem w skali Bortle'a, od 1 do 9. */
  bortle: number | null;
  timezone: string | null;
  kind: 'city' | 'capital' | 'observatory';
  population: number;
  /** Nazwa bez znaków diakrytycznych, do wyszukiwania. */
  folded: string;
}

/*
 * Skala Bortle'a opisuje, ile widać z danego miejsca. Wartość graniczna wielkości
 * gwiazdowej to najsłabsza gwiazda dostrzegalna gołym okiem w zenicie.
 */
export const BORTLE_SCALE: Record<number, { label: string; limitMag: number; note: string }> = {
  1: {
    label: 'niebo pierwotne',
    limitMag: 7.8,
    note: 'Droga Mleczna rzuca cień, widać światło zodiakalne przez całą noc. W Polsce nieosiągalne.',
  },
  2: {
    label: 'niebo naturalne',
    limitMag: 7.3,
    note: 'Droga Mleczna bardzo strukturalna, gromady kuliste widoczne gołym okiem.',
  },
  3: {
    label: 'niebo wiejskie',
    limitMag: 6.8,
    note: 'Łuny miast widoczne nad horyzontem, ale zenit pozostaje ciemny.',
  },
  4: {
    label: 'obrzeża wsi',
    limitMag: 6.3,
    note: 'Droga Mleczna wyraźna, choć bez najsubtelniejszych szczegółów.',
  },
  5: {
    label: 'niebo podmiejskie',
    limitMag: 5.8,
    note: 'Droga Mleczna słaba i widoczna tylko wysoko nad horyzontem.',
  },
  6: {
    label: 'jasne niebo podmiejskie',
    limitMag: 5.3,
    note: 'Droga Mleczna ledwie dostrzegalna w zenicie. M31 wymaga wprawy.',
  },
  7: {
    label: 'granica miasta',
    limitMag: 4.8,
    note: 'Całe niebo ma szarawą poświatę. Widoczne tylko jasne gwiazdozbiory.',
  },
  8: {
    label: 'niebo miejskie',
    limitMag: 4.3,
    note: 'Niebo świeci szarością. Gołym okiem widać kilkadziesiąt gwiazd.',
  },
  9: {
    label: 'centrum miasta',
    limitMag: 4,
    note: 'Widoczne wyłącznie planety, Księżyc i najjaśniejsze gwiazdy.',
  },
};

/** Domyślna wartość, gdy dla lokalizacji brakuje pomiaru. Odpowiada przeciętnym obrzeżom miasta. */
export const DEFAULT_BORTLE = 6;

export const bortleInfo = (value: number | null) => BORTLE_SCALE[value ?? DEFAULT_BORTLE] ?? BORTLE_SCALE[6];

/** Usuwa znaki diakrytyczne, żeby wpis "poznan" trafiał w "Poznań". */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim();
}

let cache: Promise<LocationEntry[]> | null = null;

export function loadLocations(base = '/data'): Promise<LocationEntry[]> {
  if (cache) return cache;
  cache = fetch(`${base}/locations.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Nie udało się wczytać bazy miejsc: ${res.status}`);
      return res.json() as Promise<RawLocation[]>;
    })
    .then((raw) =>
      raw.map(
        (l): LocationEntry => ({
          name: l.n,
          region: l.r,
          country: l.c,
          lat: l.la,
          lon: l.lo,
          elevation: l.e,
          bortle: l.b,
          timezone: l.t,
          kind: l.k,
          population: l.p,
          folded: l.f,
        }),
      ),
    );
  return cache;
}

/*
 * Wyszukiwanie.
 *
 * Kolejność wyników ustala trzy rzeczy naraz: dopasowanie od początku nazwy jest
 * lepsze niż w środku, miejsca w Polsce mają pierwszeństwo przed zagranicznymi,
 * a przy równym dopasowaniu decyduje liczba mieszkańców. Dzięki temu wpisanie
 * "kra" pokazuje Kraków, a nie Krasnojarsk.
 */
export function searchLocations(
  entries: LocationEntry[],
  query: string,
  limit = 12,
): LocationEntry[] {
  const q = fold(query);
  if (q.length < 2) return [];

  const scored: { entry: LocationEntry; score: number }[] = [];
  for (const entry of entries) {
    const index = entry.folded.indexOf(q);
    if (index === -1) continue;

    let score = 0;
    if (entry.folded === q) score += 1000;
    else if (index === 0) score += 600;
    else if (entry.folded[index - 1] === ' ' || entry.folded[index - 1] === '-') score += 300;
    else score += 60;

    if (entry.country === 'PL') score += 400;
    if (entry.kind === 'capital') score += 40;
    if (entry.kind === 'observatory') score += 25;
    /* Logarytm, bo różnica między miastem stutysięcznym a milionowym ma znaczyć
     * mniej niż jakość samego dopasowania nazwy. */
    score += Math.log10(entry.population + 10) * 12;
    /* Krótsze nazwy przy tym samym dopasowaniu są zwykle tym, czego szuka użytkownik. */
    score -= entry.name.length * 0.4;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

export function toGeoLocation(entry: LocationEntry): GeoLocation {
  return {
    lat: entry.lat,
    lon: entry.lon,
    elevation: entry.elevation,
    label: entry.name,
    source: 'preset',
    bortle: entry.bortle ?? DEFAULT_BORTLE,
    timezone: entry.timezone,
    region: entry.region,
  };
}

/** Najbliższa znana lokalizacja dla podanych współrzędnych, do odczytu skali Bortle'a. */
export function nearestLocation(
  entries: LocationEntry[],
  lat: number,
  lon: number,
): LocationEntry | null {
  let best: LocationEntry | null = null;
  let bestDistance = Infinity;
  for (const entry of entries) {
    const dLat = entry.lat - lat;
    const dLon = (entry.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const distance = dLat * dLat + dLon * dLon;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  /* Powyżej mniej więcej pięćdziesięciu kilometrów dopasowanie przestaje mieć sens. */
  return bestDistance < 0.25 ? best : null;
}
