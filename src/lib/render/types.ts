import type { BodyKey, GeoLocation } from '@/lib/astro/types';
import type { SatelliteRecord } from '@/lib/satellites/types';

/** Odwołanie do obiektu na mapie nieba, używane przy zaznaczaniu i wyszukiwaniu. */
export type SkyObjectRef =
  | { kind: 'star'; hip: number; index: number }
  | { kind: 'body'; key: BodyKey }
  | { kind: 'dso'; id: string }
  | { kind: 'constellation'; id: string }
  | { kind: 'asterism'; id: string }
  | { kind: 'satellite'; id: number };

export const refKey = (ref: SkyObjectRef | null): string => {
  if (!ref) return '';
  switch (ref.kind) {
    case 'star':
      return `star:${ref.hip || ref.index}`;
    case 'body':
      return `body:${ref.key}`;
    case 'dso':
      return `dso:${ref.id}`;
    case 'constellation':
      return `con:${ref.id}`;
    case 'asterism':
      return `ast:${ref.id}`;
    case 'satellite':
      return `sat:${ref.id}`;
  }
};

export const sameRef = (a: SkyObjectRef | null, b: SkyObjectRef | null): boolean =>
  refKey(a) === refKey(b);

export interface SkyView {
  /** Azymut środka kadru w stopniach. */
  azimuth: number;
  /** Wysokość środka kadru w stopniach. */
  altitude: number;
  /** Pionowe pole widzenia w stopniach. */
  fov: number;
}

export interface SkyLayers {
  milkyWay: boolean;
  constellations: boolean;
  constellationNames: boolean;
  /** Oficjalne granice gwiazdozbiorów według Międzynarodowej Unii Astronomicznej. */
  boundaries: boolean;
  /** Asteryzmy, czyli figury spoza podziału formalnego. */
  asterisms: boolean;
  starNames: boolean;
  deepSky: boolean;
  grid: boolean;
  horizon: boolean;
  atmosphere: boolean;
  /** Sztuczne satelity Ziemi, rysowane z elementów orbitalnych pobranych z sieci. */
  satellites: boolean;
}

export const DEFAULT_LAYERS: SkyLayers = {
  milkyWay: true,
  constellations: true,
  constellationNames: true,
  boundaries: false,
  asterisms: false,
  starNames: true,
  deepSky: true,
  grid: false,
  horizon: true,
  atmosphere: true,
  /* Satelity są domyślnie wyłączone, bo wymagają pobrania danych z sieci,
   * a mapa ma działać w pełni także bez połączenia. */
  satellites: false,
};

export interface SkyRenderInput {
  date: Date;
  location: GeoLocation;
  view: SkyView;
  layers: SkyLayers;
  /** Najsłabsza pokazywana wielkość gwiazdowa, ustawiana przez użytkownika. */
  magLimit: number;
  selected: SkyObjectRef | null;
  reducedMotion: boolean;
  /**
   * Mnożnik upływu czasu. Renderer używa go wyłącznie do dobrania kroku, z jakim
   * przelicza pozycje: przy szybkim przewijaniu trzeba to robić w każdej klatce,
   * przy podglądzie na żywo wystarczy raz na kilka sekund.
   */
  timeScale: number;
  /** Elementy orbitalne satelitów. Pusta lista oznacza, że warstwa nie ma czego rysować. */
  satellites: SatelliteRecord[];
}

/** Obiekt narysowany w bieżącej klatce, brany pod uwagę przy trafianiu kursorem. */
export interface HitTarget {
  ref: SkyObjectRef;
  x: number;
  y: number;
  radius: number;
  label: string;
  /** Im niższy priorytet, tym chętniej obiekt wygrywa remis przy trafieniu. */
  priority: number;
}
