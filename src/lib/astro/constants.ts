import { Body } from 'astronomy-engine';
import type { BodyKey } from './types';

/* Mapowanie kluczy aplikacji na identyfikatory silnika efemeryd. */
export const BODY_MAP: Record<BodyKey, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
};

export interface BodyProfile {
  key: BodyKey;
  name: string;
  /** Dopełniacz, potrzebny w zdaniach typu "wschód Marsa". */
  genitive: string;
  kind: 'star' | 'planet' | 'moon';
  /** Kolor tarczy używany na mapie nieba. */
  color: string;
  /** Średnica równikowa w kilometrach. */
  radiusKm: number;
  /** Okres obiegu wokół Słońca w latach ziemskich. */
  orbitYears: number | null;
  /** Doba gwiazdowa w godzinach ziemskich. */
  rotationHours: number | null;
  /** Liczba znanych księżyców. */
  moons: number | null;
  /*
   * Wielkości fizyczne podawane w odniesieniu do Ziemi, bo w kilogramach i metrach
   * na sekundę kwadrat nic nie mówią. "Masa 318 razy większa od Ziemi" jest zdaniem,
   * które da się sobie wyobrazić, a 1.898 razy dziesięć do dwudziestej siódmej nie jest.
   */
  massEarths: number | null;
  /** Przyspieszenie ziemskie na powierzchni, w odniesieniu do ziemskiego. */
  gravityEarths: number | null;
  /** Średnia temperatura powierzchni albo szczytów chmur, w stopniach Celsjusza. */
  temperatureC: number | null;
  /** Średnia odległość od Słońca w jednostkach astronomicznych. */
  distanceAu: number | null;
  /** Z czego się składa: skład atmosfery albo budowa. */
  composition: string | null;
  summary: string;
}

export const BODY_PROFILES: Record<BodyKey, BodyProfile> = {
  sun: {
    key: 'sun',
    name: 'Słońce',
    genitive: 'Słońca',
    kind: 'star',
    color: '#ffd88a',
    radiusKm: 696340,
    orbitYears: null,
    rotationHours: 609.12,
    moons: null,
    massEarths: 333000,
    gravityEarths: 27.9,
    temperatureC: 5505,
    distanceAu: null,
    composition: 'wodór 73 procent, hel 25 procent, reszta pierwiastki cięższe',
    summary:
      'Żółty karzeł typu widmowego G2V, źródło praktycznie całej energii docierającej do Ziemi. Nigdy nie patrz na niego bez certyfikowanego filtra.',
  },
  moon: {
    key: 'moon',
    name: 'Księżyc',
    genitive: 'Księżyca',
    kind: 'moon',
    color: '#e8e4dc',
    radiusKm: 1737.4,
    orbitYears: null,
    rotationHours: 655.72,
    moons: null,
    massEarths: 0.0123,
    gravityEarths: 0.165,
    temperatureC: -20,
    distanceAu: null,
    composition: 'skały krzemianowe, praktycznie bez atmosfery',
    summary:
      'Jedyny naturalny satelita Ziemi. Obraca się w tym samym czasie, w którym nas obiega, dlatego zawsze widzimy tę samą półkulę.',
  },
  mercury: {
    key: 'mercury',
    name: 'Merkury',
    genitive: 'Merkurego',
    kind: 'planet',
    color: '#b9b2a6',
    radiusKm: 2439.7,
    orbitYears: 0.241,
    rotationHours: 1407.6,
    moons: 0,
    massEarths: 0.055,
    gravityEarths: 0.378,
    temperatureC: 167,
    distanceAu: 0.387,
    composition: 'żelazne jądro pod cienką skorupą krzemianową, śladowa atmosfera',
    summary:
      'Najmniejsza i najbliższa Słońcu planeta. Nigdy nie oddala się od niego bardziej niż o 28 stopni, więc widać ją tylko tuż po zachodzie lub przed wschodem Słońca.',
  },
  venus: {
    key: 'venus',
    name: 'Wenus',
    genitive: 'Wenus',
    kind: 'planet',
    color: '#f5e2b8',
    radiusKm: 6051.8,
    orbitYears: 0.615,
    rotationHours: -5832.5,
    moons: 0,
    massEarths: 0.815,
    gravityEarths: 0.907,
    temperatureC: 464,
    distanceAu: 0.723,
    composition: 'dwutlenek węgla 96 procent, chmury kwasu siarkowego',
    summary:
      'Najjaśniejsza planeta nieba. Gęsta atmosfera z dwutlenku węgla utrzymuje przy powierzchni ponad 460 stopni Celsjusza. Obraca się wstecznie.',
  },
  mars: {
    key: 'mars',
    name: 'Mars',
    genitive: 'Marsa',
    kind: 'planet',
    color: '#d97b53',
    radiusKm: 3389.5,
    orbitYears: 1.881,
    rotationHours: 24.62,
    moons: 2,
    massEarths: 0.107,
    gravityEarths: 0.377,
    temperatureC: -65,
    distanceAu: 1.524,
    composition: 'dwutlenek węgla 95 procent, ciśnienie sto razy mniejsze niż na Ziemi',
    summary:
      'Czerwona barwa pochodzi od tlenków żelaza w regolicie. Doba trwa tam niecałe 25 godzin, a najwyższy wulkan Układu Słonecznego wznosi się na 22 kilometry.',
  },
  jupiter: {
    key: 'jupiter',
    name: 'Jowisz',
    genitive: 'Jowisza',
    kind: 'planet',
    color: '#e0c9a3',
    radiusKm: 69911,
    orbitYears: 11.86,
    rotationHours: 9.93,
    moons: 95,
    massEarths: 317.8,
    gravityEarths: 2.53,
    temperatureC: -110,
    distanceAu: 5.203,
    composition: 'wodór i hel, bez powierzchni stałej',
    summary:
      'Najmasywniejsza planeta, cięższa od wszystkich pozostałych razem wziętych. Cztery największe księżyce widać już przez lornetkę.',
  },
  saturn: {
    key: 'saturn',
    name: 'Saturn',
    genitive: 'Saturna',
    kind: 'planet',
    color: '#e3d3a8',
    radiusKm: 58232,
    orbitYears: 29.46,
    rotationHours: 10.66,
    moons: 146,
    massEarths: 95.2,
    gravityEarths: 1.06,
    temperatureC: -140,
    distanceAu: 9.537,
    composition: 'wodór i hel, gęstość mniejsza od wody',
    summary:
      'Pierścienie zbudowane z miliardów okruchów lodu rozciągają się na 280 tysięcy kilometrów, a mają zaledwie kilkadziesiąt metrów grubości.',
  },
  uranus: {
    key: 'uranus',
    name: 'Uran',
    genitive: 'Urana',
    kind: 'planet',
    color: '#a8d8dd',
    radiusKm: 25362,
    orbitYears: 84.01,
    rotationHours: -17.24,
    moons: 28,
    massEarths: 14.5,
    gravityEarths: 0.89,
    temperatureC: -195,
    distanceAu: 19.19,
    composition: 'wodór, hel i metan, który nadaje barwę',
    summary:
      'Obraca się praktycznie leżąc na boku, z osią nachyloną o 98 stopni. Na granicy widoczności gołym okiem przy bardzo ciemnym niebie.',
  },
  neptune: {
    key: 'neptune',
    name: 'Neptun',
    genitive: 'Neptuna',
    kind: 'planet',
    color: '#7ba7e0',
    radiusKm: 24622,
    orbitYears: 164.8,
    rotationHours: 16.11,
    moons: 16,
    massEarths: 17.1,
    gravityEarths: 1.14,
    temperatureC: -200,
    distanceAu: 30.07,
    composition: 'wodór, hel i metan, jądro skalno-lodowe',
    summary:
      'Pierwsza planeta odkryta na podstawie obliczeń, a nie obserwacji. Wieją tam najszybsze wiatry Układu Słonecznego, do 2100 kilometrów na godzinę.',
  },
};

export const PLANET_KEYS: BodyKey[] = [
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

export const ALL_BODY_KEYS: BodyKey[] = ['sun', 'moon', ...PLANET_KEYS];

export interface MeteorShower {
  id: string;
  name: string;
  /** Miesiąc i dzień maksimum, liczone od 1. */
  peakMonth: number;
  peakDay: number;
  /** Zakres aktywności jako pary miesiąc i dzień. */
  activeFrom: [number, number];
  activeTo: [number, number];
  /** Zenitalna liczba godzinna w warunkach idealnych. */
  zhr: number;
  /** Radiant: rektascensja w godzinach, deklinacja w stopniach. */
  radiantRa: number;
  radiantDec: number;
  /** Prędkość wejścia w atmosferę w kilometrach na sekundę. */
  velocityKms: number;
  parent: string;
  note: string;
}

export const METEOR_SHOWERS: MeteorShower[] = [
  {
    id: 'qua',
    name: 'Kwadrantydy',
    peakMonth: 1,
    peakDay: 3,
    activeFrom: [12, 28],
    activeTo: [1, 12],
    zhr: 110,
    radiantRa: 15.33,
    radiantDec: 49.5,
    velocityKms: 41,
    parent: 'planetoida 2003 EH1',
    note: 'Bardzo krótkie maksimum, liczone w godzinach. Radiant wznosi się wysoko dopiero nad ranem.',
  },
  {
    id: 'lyr',
    name: 'Lirydy',
    peakMonth: 4,
    peakDay: 22,
    activeFrom: [4, 16],
    activeTo: [4, 25],
    zhr: 18,
    radiantRa: 18.13,
    radiantDec: 34,
    velocityKms: 49,
    parent: 'kometa C/1861 G1 Thatcher',
    note: 'Najstarszy udokumentowany rój, obserwowany w Chinach już 2700 lat temu.',
  },
  {
    id: 'eta',
    name: 'Eta Akwarydy',
    peakMonth: 5,
    peakDay: 6,
    activeFrom: [4, 19],
    activeTo: [5, 28],
    zhr: 50,
    radiantRa: 22.5,
    radiantDec: -1,
    velocityKms: 66,
    parent: 'kometa Halleya',
    note: 'Z Polski widoczne słabo, radiant wschodzi krótko przed świtem.',
  },
  {
    id: 'sda',
    name: 'Delta Akwarydy Południowe',
    peakMonth: 7,
    peakDay: 30,
    activeFrom: [7, 12],
    activeTo: [8, 23],
    zhr: 25,
    radiantRa: 22.67,
    radiantDec: -16,
    velocityKms: 41,
    parent: 'kometa 96P Machholz',
    note: 'Nakłada się na początek aktywności Perseidów.',
  },
  {
    id: 'per',
    name: 'Perseidy',
    peakMonth: 8,
    peakDay: 12,
    activeFrom: [7, 17],
    activeTo: [8, 24],
    zhr: 100,
    radiantRa: 3.23,
    radiantDec: 58,
    velocityKms: 59,
    parent: 'kometa 109P Swift-Tuttle',
    note: 'Najpopularniejszy rój w Polsce. Ciepłe noce i wysoko położony radiant dają najlepsze warunki w roku.',
  },
  {
    id: 'dra',
    name: 'Drakonidy',
    peakMonth: 10,
    peakDay: 8,
    activeFrom: [10, 6],
    activeTo: [10, 10],
    zhr: 10,
    radiantRa: 17.47,
    radiantDec: 54,
    velocityKms: 20,
    parent: 'kometa 21P Giacobini-Zinner',
    note: 'Rój nieprzewidywalny. Zdarzały się deszcze po kilkaset zjawisk na godzinę. Najlepiej widoczny wieczorem.',
  },
  {
    id: 'ori',
    name: 'Orionidy',
    peakMonth: 10,
    peakDay: 21,
    activeFrom: [10, 2],
    activeTo: [11, 7],
    zhr: 20,
    radiantRa: 6.35,
    radiantDec: 16,
    velocityKms: 66,
    parent: 'kometa Halleya',
    note: 'Druga w roku okazja do oglądania pyłu z komety Halleya. Meteory bardzo szybkie.',
  },
  {
    id: 'sta',
    name: 'Taurydy Południowe',
    peakMonth: 11,
    peakDay: 5,
    activeFrom: [9, 10],
    activeTo: [11, 20],
    zhr: 5,
    radiantRa: 3.5,
    radiantDec: 15,
    velocityKms: 27,
    parent: 'kometa 2P Encke',
    note: 'Mało meteorów, ale za to często bardzo jasnych bolidów.',
  },
  {
    id: 'leo',
    name: 'Leonidy',
    peakMonth: 11,
    peakDay: 17,
    activeFrom: [11, 6],
    activeTo: [11, 30],
    zhr: 15,
    radiantRa: 10.27,
    radiantDec: 22,
    velocityKms: 71,
    parent: 'kometa 55P Tempel-Tuttle',
    note: 'Co 33 lata potrafi dać burzę meteorów. Poza tymi latami aktywność jest umiarkowana.',
  },
  {
    id: 'gem',
    name: 'Geminidy',
    peakMonth: 12,
    peakDay: 14,
    activeFrom: [12, 4],
    activeTo: [12, 20],
    zhr: 150,
    radiantRa: 7.47,
    radiantDec: 32,
    velocityKms: 35,
    parent: 'planetoida 3200 Phaethon',
    note: 'Najbogatszy rój roku. Radiant jest wysoko przez całą noc, więc warunki są lepsze niż podczas Perseidów.',
  },
  {
    id: 'urs',
    name: 'Ursydy',
    peakMonth: 12,
    peakDay: 22,
    activeFrom: [12, 17],
    activeTo: [12, 26],
    zhr: 10,
    radiantRa: 14.47,
    radiantDec: 76,
    velocityKms: 33,
    parent: 'kometa 8P Tuttle',
    note: 'Radiant okołobiegunowy, więc widoczny przez całą noc mimo niewielkiej aktywności.',
  },
];

/** Domyślna lokalizacja, gdy użytkownik nie wskaże własnej. */
export const DEFAULT_LOCATION = {
  lat: 52.2298,
  lon: 21.0118,
  elevation: 113,
  label: 'Warszawa',
  source: 'default' as const,
  bortle: 6,
  timezone: 'Europe/Warsaw',
  region: null,
};

/*
 * Miejsca proponowane, zanim użytkownik czegokolwiek poszuka.
 * Zestaw celowo łączy największe miasta z miejscami o naprawdę ciemnym niebie,
 * bo różnica między nimi jest dla obserwatora kluczowa.
 */
export const SUGGESTED_LOCATIONS = [
  { label: 'Warszawa', lat: 52.2298, lon: 21.0118, elevation: 113, bortle: 6 },
  { label: 'Kraków', lat: 50.0647, lon: 19.945, elevation: 219, bortle: 5 },
  { label: 'Poznań', lat: 52.4069, lon: 16.9299, elevation: 69, bortle: 5 },
  { label: 'Wrocław', lat: 51.1079, lon: 17.0385, elevation: 120, bortle: 8 },
  { label: 'Gdańsk', lat: 54.352, lon: 18.6466, elevation: 15, bortle: 6 },
  { label: 'Bieszczadzki Park Gwiezdnego Nieba', lat: 49.2036, lon: 22.3253, elevation: 620, bortle: 2 },
  { label: 'Izerski Park Ciemnego Nieba', lat: 50.8524, lon: 15.3399, elevation: 830, bortle: 3 },
  { label: 'Zakopane', lat: 49.299, lon: 19.9489, elevation: 819, bortle: 5 },
];
