import type { NightWindow, Visibility, VisibilityGrade } from './types';

export interface VisibilityInput {
  /** Wysokość obiektu nad horyzontem w stopniach. */
  altitude: number;
  /** Wielkość gwiazdowa obiektu. Wartość pusta oznacza obiekt rozciągły bez pomiaru. */
  magnitude: number | null;
  /** Odległość kątowa od Księżyca w stopniach. */
  moonSeparation: number | null;
  /** Ułamek tarczy Księżyca oświetlony, od 0 do 1. */
  moonIllumination: number;
  /** Czy Księżyc jest nad horyzontem. */
  moonUp: boolean;
  /** Aktualna faza doby. */
  phase: NightWindow['phase'];
  /**
   * Wysokość Słońca nad horyzontem w stopniach. To ona, a nie zgrubna faza doby,
   * rozstrzyga o jasności tła nieba, a więc o tym, co da się zobaczyć.
   */
  sunAltitude: number;
  /**
   * Najsłabsza wielkość gwiazdowa dostrzegalna gołym okiem w zenicie z danego miejsca
   * przy całkowicie ciemnym niebie. Wynika ze skali Bortle'a.
   */
  limitMag: number;
  /** Zachmurzenie w procentach. Wartość pusta oznacza brak danych pogodowych. */
  cloudCover?: number | null;
  /** Widzialność pozioma w metrach, z prognozy. Rozpoznaje mgłę i silne zamglenie. */
  horizontalVisibility?: number | null;
}

/*
 * Progi ocen. Dolna granica oceny "trudne" stoi na dwunastu punktach, a nie na jednym,
 * bo kilka punktów oznacza obiekt teoretycznie nad horyzontem, ale praktycznie nie
 * do zobaczenia: planetę w środku dnia albo gwiazdę tuż po wschodzie Słońca.
 * Nazwanie tego trudnym byłoby wprowadzaniem w błąd.
 */
const GRADES: { min: number; grade: VisibilityGrade }[] = [
  { min: 80, grade: 'doskonałe' },
  { min: 60, grade: 'dobre' },
  { min: 38, grade: 'umiarkowane' },
  { min: 12, grade: 'trudne' },
  { min: 0, grade: 'niewidoczne' },
];

function gradeFor(score: number): VisibilityGrade {
  for (const g of GRADES) if (score >= g.min) return g.grade;
  return 'niewidoczne';
}

/*
 * Ekstynkcja atmosferyczna, czyli osłabienie blasku przez warstwę powietrza.
 * Przy horyzoncie patrzymy przez blisko czterdzieści razy grubszą warstwę niż w zenicie,
 * dlatego gwiazda tracąca tam ponad trzy wielkości gwiazdowe potrafi zniknąć zupełnie.
 * Wzór na masę powietrza pochodzi od Pickeringa i pozostaje poprawny aż do horyzontu,
 * w odróżnieniu od prostego odwrotnego cosinusa, który przy niskich wysokościach zawodzi.
 */
export function airMass(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 40;
  const h = altitudeDeg;
  return 1 / Math.sin(((h + 244 / (165 + 47 * Math.pow(h, 1.1))) * Math.PI) / 180);
}

/** Osłabienie blasku w wielkościach gwiazdowych na danej wysokości nad horyzontem. */
export function extinction(altitudeDeg: number): number {
  /* Współczynnik 0.2 magnitudo na jednostkę masy powietrza odpowiada przeciętnej
   * przejrzystości powietrza w nizinnej części Europy. */
  return 0.2 * (airMass(altitudeDeg) - 1);
}

/*
 * Próg widoczności w zależności od wysokości Słońca.
 *
 * To jest sedno oceny warunków. Wcześniejsza wersja traktowała dzień jako jeden
 * z kilku stopni ciemności i dodatkowo premiowała jasne obiekty, przez co Jowisz
 * o dziewiątej rano dostawał ocenę doskonałą. Jest to nieprawda: w dzień niebo świeci
 * mniej więcej dziesięć tysięcy razy jaśniej niż w nocy i gołym okiem widać wtedy
 * wyłącznie Słońce, Księżyc i, przy dobrej przejrzystości i znajomości miejsca, Wenus.
 *
 * Punkty odniesienia poniżej odpowiadają temu, co realnie widać przy danej wysokości
 * Słońca. Interpolacja między nimi daje ciągłe przejście od dnia do nocy, bez skoków
 * na granicach zmierzchów.
 */
const TWILIGHT_LIMIT: [number, number][] = [
  [6, -4.6],
  [0, -4.0],
  [-3, -1.6],
  [-6, 1.4],
  [-9, 3.1],
  [-12, 4.4],
  [-15, 5.4],
  [-18, 6.2],
];

export function twilightLimitingMagnitude(sunAltitude: number): number {
  const first = TWILIGHT_LIMIT[0];
  if (sunAltitude >= first[0]) return first[1];
  const last = TWILIGHT_LIMIT[TWILIGHT_LIMIT.length - 1];
  if (sunAltitude <= last[0]) return Infinity;
  for (let i = 1; i < TWILIGHT_LIMIT.length; i++) {
    const [altB, magB] = TWILIGHT_LIMIT[i];
    if (sunAltitude >= altB) {
      const [altA, magA] = TWILIGHT_LIMIT[i - 1];
      const t = (sunAltitude - altA) / (altB - altA);
      return magA + (magB - magA) * t;
    }
  }
  return Infinity;
}

/*
 * Wpływ zachmurzenia na ocenę.
 *
 * Zależność nie jest liniowa, bo przy niewielkim zachmurzeniu obserwuje się w oknach
 * między chmurami i strata jest mniejsza, niż wynikałoby z procentu pokrycia nieba.
 * Dopiero powyżej połowy pokrycia okna robią się rzadkie, a przy pełnym zachmurzeniu
 * nie ma czego oglądać i ocena musi spaść do zera, niezależnie od reszty czynników.
 */
export function cloudFactor(cloudCover: number | null | undefined): number {
  if (cloudCover === null || cloudCover === undefined) return 1;
  const c = Math.max(0, Math.min(100, cloudCover)) / 100;
  return Math.max(0, 1 - Math.pow(c, 1.25));
}

/** Wpływ mgły i zamglenia, liczony z widzialności poziomej. */
export function hazeFactor(visibilityMeters: number | null | undefined): number {
  if (visibilityMeters === null || visibilityMeters === undefined) return 1;
  if (visibilityMeters >= 20000) return 1;
  if (visibilityMeters <= 1000) return 0;
  /* Od kilometra do dwudziestu kilometrów przejście jest łagodne, bo lekkie zamglenie
   * przeszkadza głównie obiektom słabym i nisko nad horyzontem. */
  return Math.min(1, 0.25 + (0.75 * (visibilityMeters - 1000)) / 19000);
}

/*
 * Wykrywalność obiektu, czyli mnożnik wynikający z zapasu jasności ponad próg.
 *
 * To najważniejsza poprawka względem pierwszej wersji oceny. Wcześniej punkty za wysokość
 * nad horyzontem i za ciemność nieba dodawały się niezależnie od tego, czy obiekt w ogóle
 * jest dostrzegalny. Wychodziło z tego, że Jowisz w środku dnia dostawał ocenę doskonałą,
 * bo stał wysoko, a gwiazda 6.5 mag na miejskim niebie dostawała ocenę dobrą razem
 * z uzasadnieniem mówiącym, że jest za słaba.
 *
 * Zapas jasności musi więc działać jako mnożnik, a nie jako składnik sumy: obiekt poniżej
 * progu widoczności nie staje się lepiej widoczny przez to, że stoi w zenicie.
 */
function detectability(headroom: number): number {
  if (headroom >= 2) return 1;
  if (headroom >= 0) return 0.55 + (headroom / 2) * 0.45;
  /* Poniżej progu: jeszcze do zobaczenia przez lornetkę, potem tylko przez teleskop. */
  if (headroom >= -1) return 0.2 + (headroom + 1) * 0.35;
  if (headroom >= -3) return 0.04 + ((headroom + 3) / 2) * 0.16;
  return 0.02;
}

/*
 * Ocena warunków obserwacyjnych w skali od 0 do 100.
 *
 * Kolejność liczenia:
 *   1. obiekt pod horyzontem daje zero,
 *   2. próg widoczności to ostrzejszy z dwóch: lokalne zanieczyszczenie światłem
 *      i jasność tła wynikająca z wysokości Słońca,
 *   3. podstawa: punkty za wysokość nad horyzontem, ciemność nieba i zapas jasności,
 *   4. kara za bliskość jasnego Księżyca,
 *   5. mnożniki: wykrywalność, zachmurzenie i zamglenie.
 *
 * Mnożniki są na końcu i działają na całość, bo ani chmura, ani zbyt jasne tło nie
 * pogarszają warunków o kilka punktów, tylko odbierają możliwość obserwacji.
 */
export function rateVisibility(input: VisibilityInput): Visibility {
  const {
    altitude,
    magnitude,
    moonSeparation,
    moonIllumination,
    moonUp,
    phase,
    sunAltitude,
    limitMag,
    cloudCover,
    horizontalVisibility,
  } = input;

  if (altitude <= 0) {
    return {
      score: 0,
      grade: 'niewidoczne',
      reason: 'Obiekt jest pod horyzontem.',
      aboveHorizon: false,
    };
  }

  /* Próg widoczności. W nocy decyduje łuna miast, w dzień i o zmierzchu jasność nieba. */
  const twilight = twilightLimitingMagnitude(sunAltitude);
  const threshold = Math.min(limitMag, twilight);
  const daylightLimited = twilight < limitMag;

  /* Wysokość. Poniżej dziesięciu stopni obserwacja jest trudna nawet przy idealnym niebie. */
  let base = 0;
  if (altitude >= 50) base += 45;
  else if (altitude >= 30) base += 36 + ((altitude - 30) / 20) * 9;
  else if (altitude >= 15) base += 22 + ((altitude - 15) / 15) * 14;
  else if (altitude >= 5) base += 8 + ((altitude - 5) / 10) * 14;
  else base += (altitude / 5) * 8;

  /*
   * Zapas jasności ponad próg. Obiekt bez podanej jasności, jak rozległa mgławica,
   * traktujemy jako umiarkowanie trudny, ale tylko wtedy, gdy niebo jest ciemne.
   */
  const effectiveMag = magnitude !== null ? magnitude + extinction(altitude) : null;
  const headroom =
    effectiveMag !== null ? threshold - effectiveMag : daylightLimited ? -4 : 1.5;

  /* Premia za zapas jasności nasyca się przy pięciu wielkościach gwiazdowych. */
  base += 20 * Math.max(0, Math.min(1, headroom / 5));

  /*
   * Ciemność nieba. Liczona wprost z wysokości Słońca, żeby ranek i wieczór wypadały
   * tak samo, a przejście przez kolejne zmierzchy było płynne.
   */
  const darkness =
    sunAltitude <= -18 ? 35 : sunAltitude >= 0 ? 0 : 35 * Math.pow(Math.min(1, -sunAltitude / 18), 1.4);
  base += darkness;

  /* Księżyc rozjaśnia tło. Kara zależy od jego fazy i odległości kątowej. */
  let moonPenalty = 0;
  if (moonUp && moonIllumination > 0.1 && sunAltitude < -6) {
    const sep = moonSeparation ?? 180;
    const proximity = sep < 20 ? 1 : sep < 45 ? 0.7 : sep < 90 ? 0.4 : 0.2;
    /* Obiekty jaśniejsze od Księżycowego tła prawie nic nie tracą. */
    const resistance = headroom > 6 ? 0.25 : headroom > 3 ? 0.6 : 1;
    moonPenalty = moonIllumination * proximity * resistance * 25;
    base -= moonPenalty;
  }

  const detect = detectability(headroom);
  const clouds = cloudFactor(cloudCover);
  const haze = hazeFactor(horizontalVisibility);
  const score = Math.round(Math.min(100, Math.max(0, base)) * detect * clouds * haze);

  /*
   * Uzasadnienie wskazuje czynnik, który najbardziej ogranicza obserwację, w kolejności
   * od najtwardszej przeszkody. Chmura jest pierwsza, bo żadna inna poprawa nie pomoże,
   * dopóki niebo jest zakryte.
   */
  let reason: string;
  const cloudPercent = cloudCover ?? null;
  if (cloudPercent !== null && cloudPercent >= 85) {
    reason = `Niebo jest zachmurzone w ${Math.round(cloudPercent)} procentach. Nie ma czego obserwować.`;
  } else if (haze < 0.5) {
    reason = 'Mgła albo silne zamglenie. Widzialność jest zbyt mała na obserwacje.';
  } else if (sunAltitude > -0.8 && headroom < 0) {
    reason = 'Jest dzień, niebo jest zbyt jasne na obserwacje.';
  } else if (headroom < -3) {
    reason = daylightLimited
      ? 'Tło nieba jest o wiele za jasne dla tego obiektu.'
      : 'Obiekt jest o wiele za słaby dla tego nieba. Potrzebny teleskop.';
  } else if (cloudPercent !== null && cloudPercent >= 55) {
    reason = `Zachmurzenie ${Math.round(cloudPercent)} procent. Obserwacja tylko w przerwach między chmurami.`;
  } else if (headroom < -0.5) {
    reason = daylightLimited
      ? 'Tło nieba jest jeszcze zbyt jasne dla tego obiektu.'
      : 'Obiekt jest zbyt słaby dla tego nieba. Potrzebna lornetka albo teleskop.';
  } else if (sunAltitude > -0.8) {
    reason = 'Obiekt jest nad horyzontem, ale niebo jest jasne od Słońca.';
  } else if (altitude < 15) {
    reason = 'Obiekt jest nisko nad horyzontem, przeszkadza ekstynkcja atmosferyczna.';
  } else if (moonPenalty > 10) {
    reason = 'Blisko jasnego Księżyca, tło nieba jest rozświetlone.';
  } else if (phase === 'civil' || phase === 'nautical') {
    reason = 'Niebo nie jest jeszcze w pełni ciemne.';
  } else if (cloudPercent !== null && cloudPercent >= 25) {
    reason = `Warunki są sprzyjające, choć niebo jest zachmurzone w ${Math.round(cloudPercent)} procentach.`;
  } else if (score >= 80) {
    reason = 'Obiekt jest wysoko na ciemnym niebie, warunki są bardzo dobre.';
  } else if (score >= 60) {
    reason = 'Warunki są sprzyjające.';
  } else {
    reason = 'Obserwacja możliwa, ale warunki nie są optymalne.';
  }

  return { score, grade: gradeFor(score), reason, aboveHorizon: true };
}

export const GRADE_TONE: Record<VisibilityGrade, 'visible' | 'warn' | 'down'> = {
  doskonałe: 'visible',
  dobre: 'visible',
  umiarkowane: 'warn',
  trudne: 'warn',
  niewidoczne: 'down',
};
