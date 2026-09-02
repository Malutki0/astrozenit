import { create } from 'zustand';

import { DEFAULT_LOCATION } from '@/lib/astro/constants';
import type { GeoLocation } from '@/lib/astro/types';
import { clampAltitude, clampFov, wrapAzimuth } from '@/lib/render/projection';
import { DEFAULT_LAYERS, type SkyLayers, type SkyObjectRef, type SkyView } from '@/lib/render/types';

const STORAGE_KEY = 'zenit:preferences';

interface StoredPreferences {
  location?: GeoLocation;
  layers?: Partial<SkyLayers>;
  magLimit?: number;
  view?: Partial<SkyView>;
  nightMode?: boolean;
  timelineCollapsed?: boolean;
}

/* Preferencje przechowujemy lokalnie w przeglądarce. Odczyt jest opakowany w blok
 * zabezpieczający, bo w trybie prywatnym dostęp do pamięci może rzucić wyjątkiem. */
function readPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPreferences) : {};
  } catch {
    return {};
  }
}

function writePreferences(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* Brak dostępu do pamięci nie jest błędem krytycznym, aplikacja działa dalej. */
  }
}

const stored = readPreferences();

/*
 * Preferencje zapisane starszą wersją aplikacji mogą nie mieć wszystkich pól.
 * Uzupełniamy braki wartościami domyślnymi, żeby aktualizacja nie psuła stanu.
 */
function normalizeLocation(location: GeoLocation | undefined): GeoLocation {
  if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') {
    return DEFAULT_LOCATION;
  }
  return {
    ...location,
    elevation: location.elevation ?? 0,
    bortle: location.bortle ?? 6,
    timezone: location.timezone ?? null,
    region: location.region ?? null,
  };
}

export interface SkyState {
  /** Chwila, dla której rysowane jest niebo. */
  date: Date;
  /** Czy czas płynie samoczynnie zgodnie z zegarem. */
  live: boolean;
  /** Mnożnik upływu czasu przy przewijaniu. Jeden oznacza czas rzeczywisty. */
  timeScale: number;
  location: GeoLocation;
  view: SkyView;
  layers: SkyLayers;
  magLimit: number;
  /**
   * Tryb czerwony. Oko przystosowuje się do ciemności przez dwadzieścia do trzydziestu
   * minut i traci to przystosowanie w kilka sekund po spojrzeniu w jasny ekran.
   * Czerwone światło o długiej fali pobudza czopki, a prawie nie pobudza pręcików
   * odpowiedzialnych za widzenie nocne, więc pozwala korzystać z mapy, nie tracąc
   * gotowości oka. To standard w astronomii amatorskiej, a nie ozdoba.
   */
  nightMode: boolean;
  /** Czy oś czasu jest zwinięta do samego zegara. */
  timelineCollapsed: boolean;
  selected: SkyObjectRef | null;
  /** Licznik zmian, którymi mapa nie steruje sama, na przykład wyśrodkowania z listy. */
  focusRequest: { azimuth: number; altitude: number; fov?: number; nonce: number } | null;

  setDate: (date: Date) => void;
  advance: (ms: number) => void;
  stepTime: (minutes: number) => void;
  goToNow: () => void;
  setLive: (live: boolean) => void;
  setTimeScale: (scale: number) => void;
  setLocation: (location: GeoLocation) => void;
  setView: (view: Partial<SkyView>) => void;
  panBy: (deltaAzimuth: number, deltaAltitude: number) => void;
  /*
   * Stan prowadzenia mapy przez czujnik orientacji telefonu.
   *
   * Poprawka to różnica między tym, co pokazuje czujnik, a tym, co widać na ekranie.
   * Powstaje przez przesunięcie obrazu palcem przy włączonym prowadzeniu i jest
   * potrzebna z dwóch niezależnych powodów. Po pierwsze, kompas magnetyczny bywa
   * przesunięty o kilkanaście stopni, zwłaszcza w budynku albo obok samochodu.
   * Po drugie, wiele telefonów z Androidem w ogóle nie podaje kierunku północy,
   * a jedynie to, o ile się obróciły, więc kierunek trzeba raz wskazać ręcznie.
   */
  compass: { active: boolean; offsetAzimuth: number; offsetAltitude: number };
  setCompassActive: (value: boolean) => void;
  zoomBy: (factor: number) => void;
  setLayer: (key: keyof SkyLayers, value: boolean) => void;
  setNightMode: (value: boolean) => void;
  setTimelineCollapsed: (value: boolean) => void;
  setMagLimit: (value: number) => void;
  select: (ref: SkyObjectRef | null) => void;
  focusOn: (azimuth: number, altitude: number, fov?: number) => void;
  clearFocus: () => void;
}

export const useSkyStore = create<SkyState>((set, get) => ({
  date: new Date(),
  live: true,
  timeScale: 1,
  location: normalizeLocation(stored.location),
  /* Widok początkowy celuje wysoko, żeby niebo zajmowało zdecydowaną większość kadru,
   * a grunt był wąskim podparciem dla horyzontu, nie połową obrazu. */
  view: { azimuth: 180, altitude: 28, fov: 100, ...stored.view },
  layers: { ...DEFAULT_LAYERS, ...stored.layers },
  magLimit: stored.magLimit ?? 6.5,
  nightMode: stored.nightMode ?? false,
  timelineCollapsed: stored.timelineCollapsed ?? false,
  selected: null,
  focusRequest: null,

  setDate: (date) => set({ date, live: false }),
  advance: (ms) => set((s) => ({ date: new Date(s.date.getTime() + ms) })),
  stepTime: (minutes) =>
    set((s) => ({ date: new Date(s.date.getTime() + minutes * 60000), live: false })),
  goToNow: () => set({ date: new Date(), live: true, timeScale: 1 }),
  setLive: (live) => set(live ? { live, date: new Date(), timeScale: 1 } : { live }),
  /*
   * Zmiana mnożnika wyłącza tryb bieżący.
   *
   * Bez tego przewijanie nie ruszało z miejsca: pętla klatek w trybie bieżącym ustawia
   * czas na teraz przy każdej klatce, więc mnożnik nie miał czego przesuwać. Objawiało się
   * to tak, że po wciśnięciu odtwarzania nic się nie działo, dopóki użytkownik nie ruszył
   * czasu ręcznie, bo dopiero to wyłączało tryb bieżący.
   *
   * Zatrzymanie przewijania, czyli mnożnik równy jeden, celowo nie włącza trybu bieżącego
   * z powrotem: użytkownik zatrzymał czas w konkretnej chwili i to ona ma zostać na ekranie.
   * Do powrotu na teraz służy przycisk "Teraz".
   */
  setTimeScale: (timeScale) => set(timeScale === 1 ? { timeScale } : { timeScale, live: false }),

  setLocation: (location) => {
    set({ location });
    writePreferences({ ...readPreferences(), location });
  },

  setView: (view) =>
    set((s) => ({
      view: {
        azimuth: wrapAzimuth(view.azimuth ?? s.view.azimuth),
        /* Przy włączonym prowadzeniu telefonem znosimy dolną granicę wysokości,
         * bo obraz ma odpowiadać kierunkowi urządzenia także przy horyzoncie i niżej. */
        altitude: clampAltitude(
          view.altitude ?? s.view.altitude,
          clampFov(view.fov ?? s.view.fov),
          s.compass.active,
        ),
        fov: clampFov(view.fov ?? s.view.fov),
      },
    })),

  compass: { active: false, offsetAzimuth: 0, offsetAltitude: 0 },

  setCompassActive: (active) =>
    set((s) => ({
      /*
       * Włączenie zeruje poprawkę. Przy telefonie znającym północ widok ma skoczyć
       * tam, gdzie naprawdę celuje urządzenie, a nie tam, gdzie akurat patrzył
       * użytkownik: przeniesienie starej poprawki byłoby przeniesieniem korekty
       * do błędu, którego już nie ma.
       */
      compass: active
        ? { active: true, offsetAzimuth: 0, offsetAltitude: 0 }
        : { ...s.compass, active: false },
    })),

  panBy: (deltaAzimuth, deltaAltitude) =>
    set((s) => {
      const azimuth = wrapAzimuth(s.view.azimuth + deltaAzimuth);
      /* Ta sama zasada co w setView: przy prowadzeniu telefonem dolna granica znika,
       * bo inaczej poprawka wprowadzana palcem zatrzymywałaby się w innym miejscu
       * niż sam odczyt czujnika i te dwa źródła kierunku rozjeżdżałyby się. */
      const altitude = clampAltitude(
        s.view.altitude + deltaAltitude,
        s.view.fov,
        s.compass.active,
      );

      /*
       * Przy włączonym prowadzeniu przesunięcie palcem nie ustawia widoku, tylko
       * poprawkę. Widok i tak przesuwamy od razu, żeby obraz nadążał za palcem,
       * ale następny odczyt czujnika trafi dokładnie tam, gdzie palec go zostawił,
       * bo poprawka przesunęła się o tyle samo. Bez tego czujnik odbierałby obraz
       * w ułamku sekundy i przesuwanie byłoby niemożliwe.
       */
      if (!s.compass.active) return { view: { ...s.view, azimuth, altitude } };

      return {
        view: { ...s.view, azimuth, altitude },
        compass: {
          ...s.compass,
          offsetAzimuth: wrapAzimuth(s.compass.offsetAzimuth + deltaAzimuth),
          offsetAltitude: Math.max(
            -80,
            Math.min(80, s.compass.offsetAltitude + deltaAltitude),
          ),
        },
      };
    }),

  zoomBy: (factor) =>
    set((s) => ({ view: { ...s.view, fov: clampFov(s.view.fov * factor) } })),

  setNightMode: (nightMode) => {
    set({ nightMode });
    writePreferences({ ...readPreferences(), nightMode });
  },

  setTimelineCollapsed: (timelineCollapsed) => {
    set({ timelineCollapsed });
    writePreferences({ ...readPreferences(), timelineCollapsed });
  },

  setLayer: (key, value) => {
    const layers = { ...get().layers, [key]: value };
    set({ layers });
    writePreferences({ ...readPreferences(), layers });
  },

  setMagLimit: (magLimit) => {
    set({ magLimit });
    writePreferences({ ...readPreferences(), magLimit });
  },

  select: (selected) => set({ selected }),

  focusOn: (azimuth, altitude, fov) =>
    set((s) => ({
      focusRequest: { azimuth, altitude, fov, nonce: (s.focusRequest?.nonce ?? 0) + 1 },
      view: fov ? { ...s.view, fov: clampFov(fov) } : s.view,
    })),

  clearFocus: () => set({ focusRequest: null }),
}));

/* Selektory atomowe. Zustand w wersji piątej porównuje wyniki referencyjnie,
 * więc zwracanie nowych obiektów z selektora powodowałoby zbędne przerysowania. */
export const useSkyDate = () => useSkyStore((s) => s.date);
export const useSkyLocation = () => useSkyStore((s) => s.location);
export const useSkyView = () => useSkyStore((s) => s.view);
export const useSkyLayers = () => useSkyStore((s) => s.layers);
export const useSelected = () => useSkyStore((s) => s.selected);
export const useIsLive = () => useSkyStore((s) => s.live);

/*
 * Dokładny czas symulacji, rozsyłany poza stanem Reacta.
 *
 * Data w sklepie zmienia się raz na sekundę, bo częściej nie ma czego pokazywać:
 * zegar w pasku i tak wyświetla pełne minuty. Oś czasu potrzebuje jednak wartości
 * dokładnej w każdej klatce, żeby uchwyt sunął płynnie. Trzymanie jej w stanie Reacta
 * oznaczałoby przerysowanie drzewa sześćdziesiąt razy na sekundę, więc zamiast tego
 * pętla klatek rozsyła ją tym kanałem, a odbiorcy zapisują wynik wprost do stylu
 * elementu, z pominięciem renderowania.
 */
type TimeListener = (milliseconds: number) => void;
const timeListeners = new Set<TimeListener>();

export function onPreciseTime(listener: TimeListener): () => void {
  timeListeners.add(listener);
  return () => {
    timeListeners.delete(listener);
  };
}

export function emitPreciseTime(milliseconds: number): void {
  for (const listener of timeListeners) listener(milliseconds);
}
