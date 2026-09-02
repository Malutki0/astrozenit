/*
 * Pogoda z serwisu Open-Meteo.
 *
 * Wybrany, bo jako jedyny z darmowych daje wszystko, czego potrzebuje ocena warunków,
 * bez zakładania konta i bez klucza, który i tak trzeba by trzymać w kodzie strony,
 * czyli jawnie. Do tego udostępnia dane na licencji CC BY 4.0 i pozwala odpytać
 * wiele punktów jednym zapytaniem, co pozwala zbudować regionalną mapę zachmurzenia
 * bez pobierania kafelków z obrazem.
 *
 * Model: ICON i inne, wybierane automatycznie dla danego obszaru.
 */

import type { CloudGrid, WeatherHour, WeatherProvider, WeatherReport } from './types';

/*
 * Przycięcie współrzędnych przed wysłaniem na zewnątrz.
 *
 * Cztery miejsca po przecinku, których używaliśmy wcześniej, to około jedenastu metrów,
 * czyli dokładność wskazująca konkretny budynek. Serwis pogodowy dostawał więc adres
 * domowy użytkownika, mimo że prognoza jest liczona w siatce o oczku około jedenastu
 * kilometrów i taka dokładność nie zmienia w niej ani jednej wartości.
 *
 * Dwa miejsca po przecinku to około 1,1 km na południku. Wystarcza z ogromnym zapasem
 * dla prognozy, a przestaje wskazywać dom. Sekcja o projekcie obiecuje dokładnie to
 * i od teraz ta obietnica jest prawdziwa.
 */
function przytnij(stopnie: number): string {
  return stopnie.toFixed(2);
}

const BASE = 'https://api.open-meteo.com/v1/forecast';

const FIELDS = [
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'precipitation',
].join(',');

interface HourlyBlock {
  time: string[];
  cloud_cover: (number | null)[];
  cloud_cover_low: (number | null)[];
  cloud_cover_mid: (number | null)[];
  cloud_cover_high: (number | null)[];
  visibility: (number | null)[];
  temperature_2m: (number | null)[];
  relative_humidity_2m: (number | null)[];
  dew_point_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  precipitation: (number | null)[];
}

interface Answer {
  latitude: number;
  longitude: number;
  hourly: HourlyBlock;
}

const n = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/*
 * Czas przychodzi bez strefy, w postaci "2026-09-01T21:00", i jest już wyrażony
 * w strefie punktu pomiaru. Dopisanie litery Z zrobiłoby z niego czas uniwersalny
 * i przesunęło o dwie godziny, dlatego rozbieramy go ręcznie i budujemy datę lokalną.
 * Działa poprawnie tylko przy założeniu, że przeglądarka stoi w tej samej strefie,
 * o co prosimy parametrem timezone=auto. Dla obserwacji z własnego miejsca to prawda.
 */
function parseLocalTime(text: string): Date {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(text);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
}

function toHours(block: HourlyBlock): WeatherHour[] {
  const out: WeatherHour[] = [];
  for (let i = 0; i < block.time.length; i++) {
    out.push({
      time: parseLocalTime(block.time[i]),
      cloudCover: n(block.cloud_cover?.[i], 0),
      cloudLow: n(block.cloud_cover_low?.[i], 0),
      cloudMid: n(block.cloud_cover_mid?.[i], 0),
      cloudHigh: n(block.cloud_cover_high?.[i], 0),
      visibility: n(block.visibility?.[i], 24000),
      temperature: n(block.temperature_2m?.[i], 0),
      humidity: n(block.relative_humidity_2m?.[i], 0),
      dewPoint: n(block.dew_point_2m?.[i], 0),
      wind: n(block.wind_speed_10m?.[i], 0),
      precipitation: n(block.precipitation?.[i], 0),
    });
  }
  return out;
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly id = 'open-meteo';
  readonly label = 'Open-Meteo';
  readonly attribution = 'Dane pogodowe: Open-Meteo.com, licencja CC BY 4.0';

  async fetchReport(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherReport> {
    const url =
      `${BASE}?latitude=${przytnij(lat)}&longitude=${przytnij(lon)}` +
      `&hourly=${FIELDS}&forecast_days=4&timezone=auto`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Serwis pogodowy odpowiedział kodem ${response.status}.`);
    const data = (await response.json()) as Answer;
    if (!data?.hourly?.time?.length) throw new Error('Serwis pogodowy nie zwrócił prognozy godzinowej.');
    return {
      lat: data.latitude,
      lon: data.longitude,
      fetchedAt: Date.now(),
      hours: toHours(data.hourly),
      source: this.label,
    };
  }

  /*
   * Regionalna mapa zachmurzenia.
   *
   * Zamiast pobierać gotowy obraz z satelity budujemy własną siatkę punktów i pytamy
   * o zachmurzenie w każdym z nich. Daje to trzy rzeczy naraz: prognozę zamiast samego
   * stanu bieżącego, pełną kontrolę nad wyglądem mapy i brak zależności od usług
   * z kafelkami, które bywają płatne albo znikają. Kosztem jest rozdzielczość,
   * ale przy planowaniu obserwacji liczy się skala kilkudziesięciu kilometrów,
   * a nie pojedyncza chmura nad podwórkiem.
   */
  async fetchCloudGrid(lat: number, lon: number, signal?: AbortSignal): Promise<CloudGrid> {
    const size = 7;
    const half = (size - 1) / 2;
    /* Około 440 km wzdłuż południka. W długości geograficznej krok jest większy,
     * bo na tej szerokości stopień długości jest wyraźnie krótszy niż stopień szerokości. */
    const stepLat = 0.66;
    const stepLon = stepLat / Math.max(0.25, Math.cos((lat * Math.PI) / 180));

    /* Siatkę liczymy od punktu już przyciętego, a nie od dokładnego położenia użytkownika.
     * Inaczej środkowe oczko zdradzałoby jego dom z dokładnością do stu metrów, mimo że
     * sąsiednie oczka są od niego oddalone o siedemdziesiąt kilometrów. */
    const baseLat = Number(przytnij(lat));
    const baseLon = Number(przytnij(lon));

    const lats: string[] = [];
    const lons: string[] = [];
    for (let row = -half; row <= half; row++) {
      for (let col = -half; col <= half; col++) {
        lats.push((baseLat + row * stepLat).toFixed(2));
        lons.push((baseLon + col * stepLon).toFixed(2));
      }
    }

    const url =
      `${BASE}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
      '&hourly=cloud_cover&forecast_days=2&timezone=auto';
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Serwis pogodowy odpowiedział kodem ${response.status}.`);
    const data = (await response.json()) as Answer[] | Answer;
    const list = Array.isArray(data) ? data : [data];
    if (!list.length || !list[0]?.hourly?.time?.length) {
      throw new Error('Serwis pogodowy nie zwrócił siatki zachmurzenia.');
    }

    return {
      start: parseLocalTime(list[0].hourly.time[0]),
      spanLat: stepLat * (size - 1),
      spanLon: stepLon * (size - 1),
      size,
      centerLat: lat,
      centerLon: lon,
      cells: list.map((cell) => ({
        lat: cell.latitude,
        lon: cell.longitude,
        cover: (cell.hourly.cloud_cover ?? []).map((v) => n(v, 0)),
      })),
      fetchedAt: Date.now(),
    };
  }
}

export const weatherProvider: WeatherProvider = new OpenMeteoProvider();
