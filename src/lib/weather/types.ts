/*
 * Pogoda w ocenie warunków obserwacyjnych.
 *
 * Astronomia amatorska rozdziela dwie rzeczy, które potocznie zlewają się w jedno:
 *   przejrzystość, czyli ile światła gwiazd dociera przez atmosferę, psuta przez
 *     chmury, mgłę, pył i wilgoć,
 *   spokój powietrza, czyli jak bardzo obraz drga, zależny od turbulencji.
 * Chmury rozstrzygają o pierwszym i to one decydują, czy w ogóle jest co oglądać.
 */

export interface WeatherHour {
  time: Date;
  /** Zachmurzenie całkowite w procentach. */
  cloudCover: number;
  /** Chmury niskie, do dwóch kilometrów. To one najczęściej zamykają niebo. */
  cloudLow: number;
  /** Chmury średnie, od dwóch do sześciu kilometrów. */
  cloudMid: number;
  /** Chmury wysokie, powyżej sześciu kilometrów. Cienkie cirrusy przepuszczają gwiazdy. */
  cloudHigh: number;
  /** Widzialność pozioma w metrach. Poniżej pięciu kilometrów oznacza mgłę albo zamglenie. */
  visibility: number;
  temperature: number;
  /** Wilgotność względna w procentach. */
  humidity: number;
  /** Punkt rosy. Różnica z temperaturą mówi, jak blisko jest wyroszenie optyki. */
  dewPoint: number;
  /** Prędkość wiatru w kilometrach na godzinę. */
  wind: number;
  /** Opad w milimetrach. */
  precipitation: number;
}

export interface WeatherReport {
  lat: number;
  lon: number;
  /** Chwila pobrania danych, w milisekundach. */
  fetchedAt: number;
  hours: WeatherHour[];
  /** Nazwa źródła, pokazywana użytkownikowi razem z licencją. */
  source: string;
}

/** Punkt regionalnej siatki zachmurzenia. */
export interface CloudCell {
  lat: number;
  lon: number;
  /** Zachmurzenie w kolejnych godzinach, w procentach. */
  cover: number[];
}

export interface CloudGrid {
  /** Czas pierwszej godziny w siatce. */
  start: Date;
  /** Rozpiętość siatki w stopniach szerokości i długości geograficznej. */
  spanLat: number;
  spanLon: number;
  /** Liczba punktów wzdłuż jednej krawędzi. Siatka jest kwadratowa. */
  size: number;
  centerLat: number;
  centerLon: number;
  cells: CloudCell[];
  fetchedAt: number;
}

/*
 * Kontrakt źródła pogody.
 *
 * Cała aplikacja korzysta wyłącznie z tego interfejsu, więc zamiana Open-Meteo na
 * dowolną inną usługę, także na własne zaplecze z kluczem trzymanym po stronie serwera,
 * sprowadza się do drugiej implementacji i jednej linii w `weatherProvider`.
 */
export interface WeatherProvider {
  readonly id: string;
  readonly label: string;
  /** Nazwa i warunki licencyjne źródła, do pokazania w interfejsie. */
  readonly attribution: string;
  fetchReport(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherReport>;
  fetchCloudGrid(lat: number, lon: number, signal?: AbortSignal): Promise<CloudGrid>;
}
