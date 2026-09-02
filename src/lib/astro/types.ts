/* Wspólne typy warstwy astronomicznej. */

export type BodyKey =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export type ObjectKind = 'planet' | 'star' | 'dso' | 'moon' | 'sun' | 'constellation';

export interface GeoLocation {
  /** Szerokość geograficzna w stopniach, dodatnia na północ. */
  lat: number;
  /** Długość geograficzna w stopniach, dodatnia na wschód. */
  lon: number;
  /** Wysokość nad poziomem morza w metrach. */
  elevation: number;
  /** Etykieta pokazywana w interfejsie. */
  label: string;
  /** Skąd pochodzi lokalizacja. */
  source: 'default' | 'geolocation' | 'manual' | 'preset';
  /** Zanieczyszczenie nieba światłem w skali Bortle'a, od 1 do 9. */
  bortle: number;
  /** Strefa czasowa w zapisie IANA, jeśli znana. */
  timezone: string | null;
  /** Kraj albo region, pusty dla miejsc w Polsce. */
  region: string | null;
}

/** Pozycja obiektu na niebie w danej chwili i dla danej lokalizacji. */
export interface SkyPosition {
  /** Rektascensja w godzinach, epoka daty. */
  ra: number;
  /** Deklinacja w stopniach, epoka daty. */
  dec: number;
  /** Azymut w stopniach, 0 to północ, rośnie na wschód. */
  azimuth: number;
  /** Wysokość nad horyzontem w stopniach, z uwzględnieniem refrakcji. */
  altitude: number;
}

export interface RiseSetTimes {
  rise: Date | null;
  transit: Date | null;
  set: Date | null;
  /** Wysokość obiektu w górowaniu, w stopniach. */
  transitAltitude: number | null;
  /** Obiekt nie zachodzi w ciągu doby. */
  circumpolar: boolean;
  /** Obiekt nie wschodzi w ciągu doby. */
  neverRises: boolean;
}

export interface BodyState {
  key: BodyKey;
  name: string;
  position: SkyPosition;
  /** Wielkość gwiazdowa. */
  magnitude: number;
  /** Odległość od Ziemi w jednostkach astronomicznych. */
  distanceAu: number;
  /** Odległość od Ziemi w kilometrach. */
  distanceKm: number;
  /** Ułamek tarczy oświetlony, od 0 do 1. */
  phaseFraction: number;
  /** Kąt fazowy w stopniach. */
  phaseAngle: number;
  /** Elongacja od Słońca w stopniach. */
  elongation: number;
  /** Widoczna średnica kątowa w sekundach łuku. */
  angularSizeArcsec: number;
  /** Gwiazdozbiór, w którym obiekt aktualnie się znajduje. */
  constellation: string;
}

export interface MoonState extends BodyState {
  /** Faza w stopniach, 0 nów, 90 pierwsza kwadra, 180 pełnia, 270 ostatnia kwadra. */
  phaseAngleDeg: number;
  /** Nazwa fazy po polsku. */
  phaseName: string;
  /** Wiek Księżyca w dobach od ostatniego nowiu. */
  ageDays: number;
  /** Czy tarcza rośnie. */
  waxing: boolean;
  /** Libracja: szerokość i długość, w stopniach. */
  librationLat: number;
  librationLon: number;
  /** Kąt pozycyjny jasnego brzegu w stopniach. */
  brightLimbAngle: number;
}

export type TwilightPhase = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';

export interface NightWindow {
  sunset: Date | null;
  sunrise: Date | null;
  civilDusk: Date | null;
  civilDawn: Date | null;
  nauticalDusk: Date | null;
  nauticalDawn: Date | null;
  astronomicalDusk: Date | null;
  astronomicalDawn: Date | null;
  /** Aktualna faza doby. */
  phase: TwilightPhase;
  /** Długość nocy astronomicznej w minutach, null gdy nie zapada. */
  darkMinutes: number | null;
}

export type VisibilityGrade = 'doskonałe' | 'dobre' | 'umiarkowane' | 'trudne' | 'niewidoczne';

export interface Visibility {
  /** Ocena od 0 do 100. */
  score: number;
  grade: VisibilityGrade;
  /** Krótkie uzasadnienie oceny po polsku. */
  reason: string;
  aboveHorizon: boolean;
}

export type EventKind =
  | 'moon-phase'
  | 'lunar-eclipse'
  | 'solar-eclipse'
  | 'meteor-shower'
  | 'opposition'
  | 'conjunction'
  | 'elongation'
  | 'season'
  /* Pełnia wypadająca przy perygeum, popularnie superksiężyc. */
  | 'apsis'
  /* Największa jasność planety wewnętrznej, osobna od opozycji i od elongacji. */
  | 'peak-magnitude';

export interface AstroEvent {
  id: string;
  kind: EventKind;
  date: Date;
  title: string;
  detail: string;
  /** Znaczenie wydarzenia, wpływa na wyróżnienie w interfejsie. */
  rank: 1 | 2 | 3;
  /** Powiązany obiekt, jeśli istnieje. */
  body?: BodyKey;
  /* Drugie ciało, gdy zjawisko dotyczy pary. Potrzebne, żeby karta zbliżenia
   * mogła narysować oba obiekty, a nie jeden i domyślną kropkę. */
  bodyB?: BodyKey;
}
