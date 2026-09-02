/*
 * Kontrakt dostawcy danych astronomicznych.
 *
 * Wszystko, co aplikacja pokazuje w panelach i sekcjach, przechodzi przez ten interfejs.
 * Domyślna implementacja liczy lokalnie, w przeglądarce. Podmiana na zewnętrzne API
 * (NASA JPL Horizons, SIMBAD, własny serwis) sprowadza się do napisania drugiej klasy
 * spełniającej ten kontrakt i wskazania jej w konfiguracji.
 *
 * Metody są asynchroniczne celowo, mimo że implementacja lokalna zwraca wynik od razu.
 * Dzięki temu przejście na zdalne źródło nie wymaga zmian w komponentach.
 *
 * Wyjątek: rysowanie mapy nieba nie korzysta z tego interfejsu i sięga wprost po funkcje
 * lokalne, bo pętla animacji potrzebuje wyników synchronicznie, sześćdziesiąt razy na sekundę.
 * Żadne zdalne API tego nie obsłuży, a mapa musi działać także bez połączenia.
 */

import type {
  AstroEvent,
  BodyKey,
  BodyState,
  GeoLocation,
  MoonState,
  NightWindow,
  RiseSetTimes,
} from './types';

export interface SkyPointQuery {
  /** Rektascensja w godzinach, epoka J2000. */
  ra: number;
  /** Deklinacja w stopniach, epoka J2000. */
  dec: number;
  /** Odległość w latach świetlnych, potrzebna do korekty paralaksy przy bliskich obiektach. */
  distanceLightYears?: number;
}

export interface EphemerisProvider {
  /** Identyfikator używany w logach i diagnostyce. */
  readonly id: string;
  /** Nazwa pokazywana w interfejsie w sekcji o źródłach danych. */
  readonly label: string;
  /** Czy dostawca działa bez połączenia z siecią. */
  readonly offline: boolean;

  /** Pełny stan ciała Układu Słonecznego. */
  getBodyState(key: BodyKey, date: Date, location: GeoLocation): Promise<BodyState>;

  /** Stan Księżyca wraz z fazą, wiekiem i libracją. */
  getMoonState(date: Date, location: GeoLocation): Promise<MoonState>;

  /** Wschód, górowanie i zachód ciała Układu Słonecznego. */
  getRiseSet(key: BodyKey, date: Date, location: GeoLocation): Promise<RiseSetTimes>;

  /** Wschód, górowanie i zachód obiektu o stałych współrzędnych. */
  getRiseSetForPoint(point: SkyPointQuery, date: Date, location: GeoLocation): Promise<RiseSetTimes>;

  /** Zmierzchy, świty i długość nocy astronomicznej. */
  getNightWindow(date: Date, location: GeoLocation): Promise<NightWindow>;

  /** Wydarzenia astronomiczne w zadanym przedziale. */
  getEvents(from: Date, to: Date, location: GeoLocation): Promise<AstroEvent[]>;
}
