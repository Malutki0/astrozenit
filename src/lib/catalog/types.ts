/** Gwiazda z warstwy opisowej katalogu. */
export interface NamedStar {
  hip: number | null;
  /** Nazwa polska lub międzynarodowa, w zależności od tradycji. */
  name: string | null;
  nameIau: string | null;
  bayer: string | null;
  bayerPl: string | null;
  flam: number | null;
  /** Inne używane nazwy własne, ze Stellarium. */
  alt: string[] | null;
  con: string | null;
  conPl: string | null;
  /** Dopełniacz nazwy gwiazdozbioru, potrzebny w zapisie "Alfa Lutni". */
  conGen: string | null;
  /** Rektascensja w godzinach, J2000. */
  ra: number;
  /** Deklinacja w stopniach, J2000. */
  dec: number;
  mag: number;
  absMag: number | null;
  distLy: number | null;
  spect: string | null;
  spectClass: string | null;
  color: string | null;
  note: string | null;
}

export interface ConstellationRecord {
  id: string;
  la: string;
  /** Dopełniacz łaciński, na przykład Orionis. */
  gen: string | null;
  en: string | null;
  /** Przydomek używany w tradycji anglojęzycznej, na przykład Hunter dla Oriona. */
  byname: string | null;
  pl: string;
  /** Dopełniacz polski, na przykład Oriona. */
  genPl: string | null;
  season: string | null;
  /** Ranga od 1 do 3, sterująca kolejnością podpisów na mapie. */
  rank: number;
  /** Liczba gwiazd tworzących figurę. */
  starCount: number;
  /** Odcinki linii jako pary rektascensji w godzinach i deklinacji w stopniach. */
  lines: [number, number][][];
  center: [number, number];
  decMin: number;
  decMax: number;
  brightest: { name: string | null; mag: number; hip: number | null } | null;
}

export interface DeepSkyObject {
  id: string;
  ngc: string | null;
  name: string;
  nameEn: string | null;
  type: string;
  typePl: string;
  cat: 'galaktyka' | 'gromada' | 'mgławica' | 'inne';
  mag: number | null;
  dim: string | null;
  ra: number;
  dec: number;
  con: string;
  conPl: string;
  note: string | null;
}

/**
 * Katalog gwiazd w postaci równoległych tablic typowanych.
 * Taki układ pozwala przeliczyć pozycje wszystkich gwiazd w jednej ciasnej pętli,
 * bez alokacji obiektów i bez pracy dla odśmiecacza pamięci.
 */
export interface StarCatalog {
  count: number;
  /** Rektascensja w radianach, J2000. */
  ra: Float32Array;
  /** Deklinacja w radianach, J2000. */
  dec: Float32Array;
  mag: Float32Array;
  /** Wskaźnik barwy B minus V. NaN oznacza brak danych. */
  colorIndex: Float32Array;
  hip: Int32Array;
  /** Wektory jednostkowe w układzie równikowym J2000. */
  ex: Float32Array;
  ey: Float32Array;
  ez: Float32Array;
}

export interface Asterism {
  id: string;
  pl: string;
  en: string;
  note: string;
  /** Odcinki linii jako pary rektascensji w godzinach i deklinacji w stopniach. */
  lines: [number, number][][];
  center: [number, number];
}

/** Granice gwiazdozbiorów: lista łamanych o współrzędnych J2000. */
export type Boundaries = [number, number][][];

export interface CatalogBundle {
  stars: StarCatalog;
  named: NamedStar[];
  /** Indeks gwiazd opisanych po numerze katalogu Hipparcosa. */
  namedByHip: Map<number, NamedStar>;
  constellations: ConstellationRecord[];
  dso: DeepSkyObject[];
  asterisms: Asterism[];
  boundaries: Boundaries;
}
