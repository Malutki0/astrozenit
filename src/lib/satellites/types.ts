/*
 * Sztuczne satelity Ziemi.
 *
 * Satelity różnią się od reszty tej aplikacji jedną zasadniczą rzeczą: ich położenia
 * nie da się policzyć z samych praw ruchu. Orbita niskoziemska jest ciągle zaburzana
 * przez opór resztek atmosfery, spłaszczenie Ziemi i manewry korekcyjne, więc trzeba
 * pobrać aktualne elementy orbitalne i propagować je modelem SGP4.
 *
 * Elementy starzeją się szybko. Dla Międzynarodowej Stacji Kosmicznej dane sprzed
 * tygodnia dają błąd rzędu kilkudziesięciu kilometrów, czyli kilku stopni na niebie.
 * Dlatego zestaw ma datę pobrania i aplikacja mówi wprost, kiedy jest przestarzały.
 */

export interface SatelliteRecord {
  /** Numer katalogowy NORAD. */
  id: number;
  name: string;
  /** Polska nazwa albo opis, jeśli mamy. */
  label: string | null;
  line1: string;
  line2: string;
  /**
   * Przybliżona jasność wizualna przy standardowych warunkach: tysiąc kilometrów
   * odległości i połowa tarczy oświetlona. Rzeczywista jasność zależy od geometrii
   * i liczymy ją przy każdym przejściu.
   */
  standardMagnitude: number | null;
}

export interface SatelliteSet {
  satellites: SatelliteRecord[];
  fetchedAt: number;
  source: string;
  /** Czy zestaw pochodzi z kopii wbudowanej w aplikację, a nie z sieci. */
  builtin: boolean;
}

export interface SatelliteFix {
  id: number;
  name: string;
  label: string | null;
  altitude: number;
  azimuth: number;
  /** Wysokość nad powierzchnią Ziemi w kilometrach. */
  height: number;
  /** Odległość od obserwatora w kilometrach. */
  range: number;
  /** Czy satelita jest oświetlony przez Słońce, czyli czy w ogóle może być widoczny. */
  sunlit: boolean;
  /** Szacowana jasność wizualna. Wartość pusta, gdy nie znamy jasności standardowej. */
  magnitude: number | null;
}

export interface SatellitePass {
  id: number;
  name: string;
  label: string | null;
  start: Date;
  peak: Date;
  end: Date;
  /** Największa wysokość nad horyzontem w trakcie przelotu. */
  maxAltitude: number;
  /** Azymut w chwili górowania. */
  peakAzimuth: number;
  /** Azymuty pojawienia się i zniknięcia. */
  startAzimuth: number;
  endAzimuth: number;
  /** Najjaśniejsza wielkość gwiazdowa w trakcie przelotu. */
  magnitude: number | null;
  /** Czy przelot wypada na tyle ciemnym niebie, żeby dało się go zobaczyć. */
  visible: boolean;
}
