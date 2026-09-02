/*
 * Pobieranie elementów orbitalnych.
 *
 * Źródłem jest Celestrak, grupa "visual", czyli obiekty, które da się zobaczyć gołym okiem.
 * Dane są w domenie publicznej, pochodzą z amerykańskiego dowództwa kosmicznego i są
 * udostępniane bez klucza, z nagłówkami pozwalającymi na zapytanie z innej domeny.
 *
 * Elementy orbitalne starzeją się, dlatego:
 *   1. świeży zestaw z sieci trzymamy przez sześć godzin,
 *   2. przy braku sieci sięgamy po kopię wbudowaną w aplikację,
 *   3. wiek zestawu jest zawsze pokazywany użytkownikowi, bo od niego zależy,
 *      czy przewidziany przelot wypadnie co do minuty, czy z błędem kilku minut.
 */

import type { SatelliteRecord, SatelliteSet } from './types';

const SOURCES = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
];

const CACHE_KEY = 'zenit:satelity';
const TTL_MS = 6 * 3600 * 1000;

/*
 * Jasności standardowe najbardziej znanych obiektów, w wielkościach gwiazdowych
 * przy odległości tysiąca kilometrów i połowie tarczy oświetlonej. Wartości pochodzą
 * z obserwacji wizualnych zbieranych od lat przez obserwatorów satelitów.
 * Dla obiektów spoza tej listy jasności nie zgadujemy.
 */
const STANDARD_MAGNITUDE: Record<string, number> = {
  'ISS (ZARYA)': -1.3,
  'ISS (NAUKA)': -1.3,
  CSS: -0.5,
  'CSS (TIANHE)': -0.5,
  TIANHE: -0.5,
  'HST': 2.4,
  'HUBBLE SPACE TELESCOPE': 2.4,
  'ATLAS CENTAUR 2': 3.0,
  'SL-16 R/B': 2.5,
  'SL-8 R/B': 3.5,
  'ARIANE 5 R/B': 3.0,
  'COSMOS 1300': 3.4,
  'LANDSAT 8': 3.5,
  'TERRA': 2.7,
  'AQUA': 3.0,
  'ENVISAT': 2.6,
  'METOP-B': 3.4,
  'METOP-C': 3.4,
  'NOAA 15': 4.3,
  'NOAA 18': 4.0,
  'NOAA 19': 4.0,
  'GENESIS 1': 4.5,
  'GENESIS 2': 4.5,
  'TIANGONG 1': 0.5,
};

/** Polskie podpisy dla obiektów, które mają w naszym języku utrwaloną nazwę. */
const LABELS: Record<string, string> = {
  'ISS (ZARYA)': 'Międzynarodowa Stacja Kosmiczna',
  'ISS (NAUKA)': 'Międzynarodowa Stacja Kosmiczna',
  CSS: 'Chińska Stacja Kosmiczna',
  'CSS (TIANHE)': 'Chińska Stacja Kosmiczna',
  TIANHE: 'Chińska Stacja Kosmiczna',
  HST: 'Kosmiczny Teleskop Hubble',
  'HUBBLE SPACE TELESCOPE': 'Kosmiczny Teleskop Hubble',
};

/*
 * Rodzina obiektów.
 *
 * Duże stacje kosmiczne są w katalogu wpisane modułami: Chińska Stacja Kosmiczna
 * występuje jako CSS, TIANHE, WENTIAN i MENGTIAN, choć to jedna konstrukcja lecąca
 * po jednej orbicie. Bez sklejenia ich w rodzinę lista przelotów pokazywałaby ten sam
 * przelot cztery razy pod różnymi nazwami.
 */
export function familyOf(name: string): string | null {
  const upper = name.toUpperCase();
  if (upper.startsWith('ISS')) return 'ISS';
  if (/^(CSS|TIANHE|WENTIAN|MENGTIAN)/.test(upper)) return 'CSS';
  return null;
}

/** Rozbiera zestaw trzech linii na rekordy. Linie niepełne pomijamy w ciszy. */
export function parseTle(text: string): SatelliteRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const out: SatelliteRecord[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    const id = Number(line1.slice(2, 7).trim());
    if (!Number.isFinite(id)) continue;
    const clean = name.trim();
    out.push({
      id,
      name: clean,
      label: LABELS[clean] ?? null,
      line1,
      line2,
      standardMagnitude: STANDARD_MAGNITUDE[clean] ?? null,
    });
    i += 2;
  }
  return out;
}

function readCache(): SatelliteSet | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SatelliteSet;
    if (!parsed?.satellites?.length) return null;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(set: SatelliteSet): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(set));
  } catch {
    /* Brak miejsca w pamięci nie może przerwać działania sekcji. */
  }
}

/** Kopia wbudowana w aplikację, na wypadek braku sieci. Zawsze przestarzała, ale lepsza niż nic. */
async function loadBuiltin(signal?: AbortSignal): Promise<SatelliteSet> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/satellites.json`, { signal });
  if (!response.ok) throw new Error('Brak wbudowanej kopii elementów orbitalnych.');
  const data = (await response.json()) as { fetchedAt: number; tle: string };
  return {
    satellites: parseTle(data.tle),
    fetchedAt: data.fetchedAt,
    source: 'kopia wbudowana w aplikację',
    builtin: true,
  };
}

export async function loadSatellites(force = false, signal?: AbortSignal): Promise<SatelliteSet> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  const collected = new Map<number, SatelliteRecord>();
  let networkOk = false;
  for (const url of SOURCES) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) continue;
      const text = await response.text();
      for (const record of parseTle(text)) collected.set(record.id, record);
      networkOk = true;
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      /* Jedno źródło może być niedostępne, drugie wystarczy. */
    }
  }

  if (networkOk && collected.size > 0) {
    const set: SatelliteSet = {
      satellites: [...collected.values()],
      fetchedAt: Date.now(),
      source: 'Celestrak, grupy "visual" i "stations"',
      builtin: false,
    };
    writeCache(set);
    return set;
  }

  return loadBuiltin(signal);
}
