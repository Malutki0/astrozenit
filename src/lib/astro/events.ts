import {
  Body,
  Equator,
  EclipseKind,
  NextLocalSolarEclipse,
  NextLunarEclipse,
  NextMoonQuarter,
  Observer,
  SearchLocalSolarEclipse,
  SearchLunarEclipse,
  SearchLunarApsis,
  NextLunarApsis,
  SearchMaxElongation,
  SearchMoonQuarter,
  SearchPeakMagnitude,
  SearchRelativeLongitude,
  Seasons,
} from 'astronomy-engine';

import { BODY_MAP, BODY_PROFILES, METEOR_SHOWERS } from './constants';
import { QUARTER_NAMES } from './moon';
import type { AstroEvent, BodyKey } from './types';

const DAY_MS = 86400000;
const D2R = Math.PI / 180;

const ECLIPSE_KIND_PL: Record<string, string> = {
  [EclipseKind.Penumbral]: 'półcieniowe',
  [EclipseKind.Partial]: 'częściowe',
  [EclipseKind.Annular]: 'obrączkowe',
  [EclipseKind.Total]: 'całkowite',
};

const inRange = (d: Date, from: Date, to: Date) => d >= from && d <= to;

/*
 * Planety widoczne gołym okiem.
 *
 * Pięć klasycznych planet, znanych i obserwowanych od starożytności, bo tylko one
 * są dostatecznie jasne. Uran przy najlepszym ustawieniu ma 5,6 wielkości gwiazdowej,
 * czyli teoretycznie mieści się w zasięgu oka, ale wymaga nieba bez śladu łuny miejskiej
 * i wiedzy, gdzie dokładnie patrzeć. Neptun przy 7,8 nie jest widoczny nigdy i nigdzie.
 *
 * Kalendarz pokazuje wyłącznie zjawiska z udziałem tych pięciu. Opozycja Neptuna jest
 * faktem astronomicznym, ale nie jest wydarzeniem dla kogoś, kto wychodzi wieczorem
 * przed dom, a spis, w którym połowa pozycji jest niedostępna, uczy pomijania spisu.
 */
const NAKED_EYE_PLANETS: BodyKey[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/** Kwadry Księżyca w zadanym przedziale. */
function moonPhaseEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  let mq = SearchMoonQuarter(from);
  let guard = 0;
  while (mq.time.date <= to && guard++ < 400) {
    const q = mq.quarter as 0 | 1 | 2 | 3;
    const name = QUARTER_NAMES[q];
    out.push({
      id: `moon-${mq.time.date.toISOString()}`,
      kind: 'moon-phase',
      date: mq.time.date,
      title: name,
      detail:
        q === 0
          ? 'Najciemniejsze niebo w miesiącu, najlepszy moment na obiekty głębokiego nieba.'
          : q === 2
            ? 'Tarcza w pełni oświetlona. Niebo jest rozświetlone przez całą noc.'
            : 'Połowa tarczy oświetlona. Dobry moment na obserwację kraterów wzdłuż terminatora.',
      rank: q === 0 || q === 2 ? 2 : 3,
      body: 'moon',
    });
    mq = NextMoonQuarter(mq);
  }
  return out;
}

/** Zaćmienia Księżyca widoczne globalnie. */
function lunarEclipseEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  let e = SearchLunarEclipse(from);
  let guard = 0;
  while (e.peak.date <= to && guard++ < 40) {
    if (inRange(e.peak.date, from, to)) {
      const kind = ECLIPSE_KIND_PL[e.kind] ?? e.kind;
      out.push({
        id: `lecl-${e.peak.date.toISOString()}`,
        kind: 'lunar-eclipse',
        date: e.peak.date,
        title: `Zaćmienie Księżyca ${kind}`,
        detail:
          e.kind === EclipseKind.Penumbral
            ? 'Księżyc wchodzi tylko w półcień Ziemi. Zmiana jasności jest ledwie zauważalna.'
            : `Maksimum zakrycia tarczy: ${Math.round(e.obscuration * 100)} procent. Faza całkowita widoczna z całej półkuli nocnej.`,
        rank: e.kind === EclipseKind.Total ? 1 : e.kind === EclipseKind.Partial ? 2 : 3,
        body: 'moon',
      });
    }
    e = NextLunarEclipse(e.peak);
  }
  return out;
}

/** Zaćmienia Słońca liczone dla konkretnego miejsca obserwacji. */
function solarEclipseEvents(from: Date, to: Date, observer: Observer): AstroEvent[] {
  const out: AstroEvent[] = [];
  let e = SearchLocalSolarEclipse(from, observer);
  let guard = 0;
  while (e.peak.time.date <= to && guard++ < 40) {
    if (inRange(e.peak.time.date, from, to)) {
      const kind = ECLIPSE_KIND_PL[e.kind] ?? e.kind;
      out.push({
        id: `secl-${e.peak.time.date.toISOString()}`,
        kind: 'solar-eclipse',
        date: e.peak.time.date,
        title: `Zaćmienie Słońca ${kind}`,
        detail: `Z Twojej lokalizacji zakryte zostanie ${Math.round(e.obscuration * 100)} procent tarczy. Obserwacja wyłącznie przez certyfikowany filtr słoneczny.`,
        rank: e.kind === EclipseKind.Total || e.kind === EclipseKind.Annular ? 1 : 2,
        body: 'sun',
      });
    }
    e = NextLocalSolarEclipse(e.peak.time, observer);
  }
  return out;
}

/** Maksima rojów meteorów przypadające w zadanym przedziale. */
function meteorEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    for (const shower of METEOR_SHOWERS) {
      const date = new Date(year, shower.peakMonth - 1, shower.peakDay, 2, 0, 0, 0);
      if (!inRange(date, from, to)) continue;
      out.push({
        id: `meteor-${shower.id}-${year}`,
        kind: 'meteor-shower',
        date,
        title: `Maksimum roju ${shower.name}`,
        detail: `Do ${shower.zhr} zjawisk na godzinę w warunkach idealnych. ${shower.note}`,
        rank: shower.zhr >= 80 ? 1 : shower.zhr >= 20 ? 2 : 3,
      });
    }
  }
  return out;
}

/** Opozycje planet zewnętrznych, czyli najlepsze momenty na ich obserwację. */
function oppositionEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  const outer: BodyKey[] = ['mars', 'jupiter', 'saturn'];
  for (const key of outer) {
    let cursor = from;
    let guard = 0;
    /* Opozycja wypada mniej więcej raz na rok, a spis sięga kilku lat, więc zapas
     * musi być większy niż liczba lat w zakresie. */
    while (guard++ < 40) {
      const t = SearchRelativeLongitude(BODY_MAP[key], 0, cursor);
      if (!t || t.date > to) break;
      const profile = BODY_PROFILES[key];
      out.push({
        id: `opp-${key}-${t.date.toISOString()}`,
        kind: 'opposition',
        date: t.date,
        title: `Opozycja ${profile.genitive}`,
        detail: `Planeta znajduje się naprzeciw Słońca, świeci najjaśniej w całym okresie obiegu i jest widoczna przez całą noc. Najlepszy moment roku na obserwację ${profile.genitive}.`,
        rank: 1,
        body: key,
      });
      cursor = new Date(t.date.getTime() + 30 * DAY_MS);
    }
  }
  return out;
}

/** Maksymalne elongacje Merkurego i Wenus, jedyne okna widoczności planet wewnętrznych. */
function elongationEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  for (const key of ['mercury', 'venus'] as BodyKey[]) {
    let cursor = from;
    let guard = 0;
    /* Merkury osiąga elongację około sześć razy w roku, więc przy spisie
     * na kilka lat zapas dwunastu przebiegów urywał listę w połowie. */
    while (guard++ < 80) {
      const e = SearchMaxElongation(BODY_MAP[key], cursor);
      if (!e || e.time.date > to) break;
      const profile = BODY_PROFILES[key];
      const evening = e.visibility === 'evening';
      out.push({
        id: `elo-${key}-${e.time.date.toISOString()}`,
        kind: 'elongation',
        date: e.time.date,
        title: `Maksymalna elongacja ${evening ? 'wschodnia' : 'zachodnia'} ${profile.genitive}`,
        detail: `Planeta oddala się od Słońca o ${e.elongation.toFixed(1)} stopnia i jest widoczna ${evening ? 'wieczorem, zaraz po zachodzie Słońca' : 'nad ranem, tuż przed wschodem Słońca'}. To najdogodniejszy moment na jej dostrzeżenie.`,
        rank: key === 'mercury' ? 2 : 2,
        body: key,
      });
      cursor = new Date(e.time.date.getTime() + 20 * DAY_MS);
    }
  }
  return out;
}

/*
 * Największa jasność Wenus.
 *
 * Nie pokrywa się z opozycją ani z maksymalną elongacją, i to jest właśnie powód,
 * dla którego warto ją podać osobno. Planeta wewnętrzna widziana z Ziemi zmienia
 * i fazę, i odległość: przy największej elongacji jest oświetlona w połowie, a im
 * bliżej Słońca na niebie, tym węższy sierp, ale i większa tarcza. Iloczyn tych dwóch
 * osiąga szczyt gdzieś pomiędzy i to wtedy Wenus jest najjaśniejszym po Księżycu
 * obiektem nocnego nieba, rzucającym cień na białą ścianę.
 *
 * Tylko Wenus, i to z dwóch niezależnych powodów. Silnik efemeryd liczy tę wielkość
 * wyłącznie dla niej, bo dla Merkurego zależność jasności od fazy jest na tyle
 * nieregularna, że wymagałaby osobnego modelu. Niezależnie od tego szczyt jasności
 * Merkurego wypada, gdy planeta stoi kilka stopni od Słońca, czyli w chwili,
 * w której i tak nie da się jej zobaczyć.
 */
function peakMagnitudeEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  for (const key of ['venus'] as BodyKey[]) {
    let cursor = from;
    let guard = 0;
    while (guard++ < 40) {
      const peak = SearchPeakMagnitude(BODY_MAP[key], cursor);
      if (!peak || peak.time.date > to) break;
      const profile = BODY_PROFILES[key];
      out.push({
        id: `peak-${key}-${peak.time.date.toISOString()}`,
        kind: 'peak-magnitude',
        date: peak.time.date,
        title: `Największa jasność ${profile.genitive}`,
        detail: `Planeta osiąga jasność ${peak.mag.toFixed(1)} wielkości gwiazdowej, największą w tym okresie obiegu. Szczyt nie wypada ani przy opozycji, ani przy największej elongacji, tylko pomiędzy: tarcza jest już wyraźnie większa, a sierp jeszcze nie zdążył zwęzić się na tyle, żeby to nadrobić.`,
        rank: 1,
        body: key,
      });
      cursor = new Date(peak.time.date.getTime() + 60 * DAY_MS);
    }
  }
  return out;
}

/*
 * Pełnia przy perygeum, czyli tak zwany superksiężyc.
 *
 * Orbita Księżyca jest wyraźnie wydłużona: w perygeum jest bliżej o około czterdzieści
 * tysięcy kilometrów niż w apogeum, więc tarcza bywa o czternaście procent szersza
 * i o trzydzieści jaśniejsza. Gołym okiem różnicy między dwiema pełniami oddalonymi
 * o pół roku nie sposób zauważyć bez porównania zdjęć, ale zjawisko jest tak szeroko
 * opisywane, że warto podać, kiedy naprawdę wypada, i przy okazji napisać, ile z tego
 * faktycznie widać.
 *
 * Za superksiężyc uznajemy pełnię wypadającą w ciągu doby od perygeum. Nie ma na to
 * definicji uzgodnionej przez astronomów, więc podajemy w opisie odległość w kilometrach,
 * z której każdy może wyciągnąć własny wniosek.
 */
function superMoonEvents(from: Date, to: Date, fazy: AstroEvent[]): AstroEvent[] {
  const out: AstroEvent[] = [];
  const pelnie = fazy.filter((e) => e.title.toLowerCase().startsWith('pełnia'));
  if (pelnie.length === 0) return out;

  /* Zbieramy wszystkie perygea w zakresie, poszerzonym o dobę z każdej strony. */
  const perygea: { date: Date; km: number }[] = [];
  let apsis = SearchLunarApsis(new Date(from.getTime() - DAY_MS));
  let guard = 0;
  while (guard++ < 200 && apsis.time.date <= new Date(to.getTime() + DAY_MS)) {
    if (apsis.kind === 0) perygea.push({ date: apsis.time.date, km: apsis.dist_km });
    apsis = NextLunarApsis(apsis);
  }

  for (const pelnia of pelnie) {
    let najblizsze: { date: Date; km: number } | null = null;
    let odstep = Infinity;
    for (const p of perygea) {
      const d = Math.abs(p.date.getTime() - pelnia.date.getTime());
      if (d < odstep) {
        odstep = d;
        najblizsze = p;
      }
    }
    if (!najblizsze || odstep > DAY_MS) continue;

    out.push({
      id: `super-${pelnia.date.toISOString()}`,
      kind: 'apsis',
      date: pelnia.date,
      title: 'Pełnia przy perygeum',
      detail: `Pełnia wypada ${(odstep / 3600000).toFixed(0)} godzin od perygeum, przy odległości ${Math.round(najblizsze.km).toLocaleString('pl-PL')} kilometrów. Tarcza jest wtedy o kilkanaście procent szersza niż przy pełni w apogeum, ale różnicy nie da się zauważyć bez porównania zdjęć: oko nie ma na niebie nic, do czego mogłoby przyłożyć miarę.`,
      rank: 2,
      body: 'moon',
    });
  }
  return out;
}

/** Równonoce i przesilenia. */
function seasonEvents(from: Date, to: Date): AstroEvent[] {
  const out: AstroEvent[] = [];
  const entries: [keyof ReturnType<typeof Seasons>, string, string][] = [
    ['mar_equinox', 'Równonoc wiosenna', 'Słońce przechodzi przez równik niebieski. Dzień i noc mają zbliżoną długość.'],
    ['jun_solstice', 'Przesilenie letnie', 'Najdłuższy dzień w roku. W Polsce noc astronomiczna nie zapada przez kilka tygodni.'],
    ['sep_equinox', 'Równonoc jesienna', 'Początek sezonu obserwacyjnego. Noce zaczynają być dłuższe od dni.'],
    ['dec_solstice', 'Przesilenie zimowe', 'Najdłuższa noc w roku, ponad czternaście godzin ciemności.'],
  ];
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    const s = Seasons(year);
    for (const [field, title, detail] of entries) {
      const date = (s[field] as { date: Date }).date;
      if (!inRange(date, from, to)) continue;
      out.push({ id: `season-${field}-${year}`, kind: 'season', date, title, detail, rank: 3 });
    }
  }
  return out;
}

/* Kątowa separacja dwóch ciał widziana z Ziemi, w stopniach. */
function separation(a: Body, b: Body, date: Date, observer: Observer): number {
  const ea = Equator(a, date, observer, true, false);
  const eb = Equator(b, date, observer, true, false);
  const ra1 = ea.ra * 15 * D2R;
  const ra2 = eb.ra * 15 * D2R;
  const d1 = ea.dec * D2R;
  const d2 = eb.dec * D2R;
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(ra1 - ra2);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / D2R;
}

/*
 * Bliskie spotkania na niebie.
 *
 * Krok pierwszy: próbkujemy odległość kątową co sześć godzin i szukamy minimów lokalnych.
 * Krok drugi: każde znalezione minimum uściślamy podziałem trójkowym w obrębie sąsiadującej
 * pary próbek, dzięki czemu moment największego zbliżenia jest podany z dokładnością do minut,
 * a nie zaokrąglony do siatki próbkowania.
 */
function refineMinimum(
  a: Body,
  b: Body,
  observer: Observer,
  loMs: number,
  hiMs: number,
): { date: Date; sep: number } {
  let lo = loMs;
  let hi = hiMs;
  for (let i = 0; i < 40 && hi - lo > 30000; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (separation(a, b, new Date(m1), observer) < separation(a, b, new Date(m2), observer)) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  const date = new Date((lo + hi) / 2);
  return { date, sep: separation(a, b, date, observer) };
}

/*
 * Zbliżenia dwóch ciał na niebie.
 *
 * Minimum odległości kątowej znajdujemy próbkowaniem, więc krok musi być wyraźnie
 * krótszy niż czas trwania zbliżenia. Księżyc przesuwa się mniej więcej trzynaście
 * stopni na dobę, przez co jego zbliżenie mieści się w kilku godzinach i wymaga
 * kroku sześciogodzinnego. Pary planet zmieniają się przez wiele dni, więc dla nich
 * wystarcza krok dobowy. Rozdzielenie tych dwóch przypadków pozwala policzyć
 * kilkanaście miesięcy naprzód bez zamrażania interfejsu.
 */
function conjunctionEvents(
  from: Date,
  to: Date,
  observer: Observer,
  settings: { stepHours: number; includeMoon: boolean },
): AstroEvent[] {
  const out: AstroEvent[] = [];
  const span = to.getTime() - from.getTime();
  /*
   * Górna granica zakresu. Skanowanie zbliżeń jest jedyną częścią kalendarza liczoną
   * krok po kroku, więc jego koszt rośnie wprost z długością spisu. Cztery lata przy
   * kroku dobowym to około czterdziestu tysięcy sprawdzeń i mieści się w ćwierci
   * sekundy, czyli w budżecie odroczonego przeliczenia. Wcześniejsza granica
   * dziewięciuset dni była za ciasna i przy spisie do 2029 roku cicho wycinała
   * wszystkie zbliżenia, zamiast policzyć je wolniej.
   */
  if (span <= 0 || span > 1600 * DAY_MS) return out;

  const stepMs = settings.stepHours * 3600 * 1000;
  const steps = Math.ceil(span / stepMs);

  /*
   * Pary bierzemy wyłącznie spośród planet widocznych gołym okiem. Poza wiernością
   * spisu daje to oszczędność: par jest wtedy dziesięć zamiast dwudziestu ośmiu,
   * więc skanowanie kosztuje trzecią część tego, co wcześniej.
   */
  const planets = NAKED_EYE_PLANETS;
  const faint = new Set<BodyKey>();
  const pairs: { a: BodyKey; b: BodyKey; limit: number }[] = [];
  if (settings.includeMoon) {
    for (const p of planets) pairs.push({ a: 'moon', b: p, limit: 4 });
  }
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      pairs.push({ a: planets[i], b: planets[j], limit: 3 });
    }
  }

  for (const pair of pairs) {
    const ba = BODY_MAP[pair.a];
    const bb = BODY_MAP[pair.b];
    const dim = faint.has(pair.a) || faint.has(pair.b);
    let prev = Infinity;
    let prevPrev = Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = from.getTime() + i * stepMs;
      const sep = separation(ba, bb, new Date(t), observer);
      /* Minimum lokalne rozpoznajemy po tym, że próbka środkowa jest niższa od obu sąsiadek. */
      if (prev < prevPrev && prev < sep && prev <= pair.limit) {
        const exact = refineMinimum(ba, bb, observer, t - 2 * stepMs, t);
        if (exact.date >= from && exact.date <= to && exact.sep <= pair.limit) {
          const na = BODY_PROFILES[pair.a].name;
          const nb = BODY_PROFILES[pair.b].name;
          const close = exact.sep < 1;
          out.push({
            id: `conj-${pair.a}-${pair.b}-${exact.date.toISOString()}`,
            kind: 'conjunction',
            date: exact.date,
            title: `Zbliżenie: ${na} i ${nb}`,
            detail: `Obiekty dzieli na niebie ${exact.sep.toFixed(1)} stopnia. ${
              close
                ? 'Zmieszczą się w jednym polu widzenia teleskopu.'
                : dim
                  ? 'Do dostrzeżenia słabszego składnika potrzebna będzie lornetka.'
                  : 'Efektowna para dla gołego oka i lornetki.'
            }`,
            rank: dim ? 3 : close ? 1 : exact.sep < 2 ? 2 : 3,
            body: pair.a === 'moon' ? pair.b : pair.a,
            bodyB: pair.a === 'moon' ? 'moon' : pair.b,
          });
        }
      }
      prevPrev = prev;
      prev = sep;
    }
  }
  return out;
}

export interface EventOptions {
  includeConjunctions?: boolean;
  /* Krok próbkowania zbliżeń. Sześć godzin dla widoku miesiąca, doba dla widoku wieloletniego. */
  conjunctionStepHours?: number;
  /* Zbliżenia Księżyca powtarzają się co miesiąc, więc w widoku wieloletnim tylko zaszumiają listę. */
  includeMoonConjunctions?: boolean;
}

/** Wszystkie wydarzenia astronomiczne w zadanym przedziale, posortowane chronologicznie. */
export function generateEvents(
  from: Date,
  to: Date,
  observer: Observer,
  options: EventOptions = {},
): AstroEvent[] {
  const fazy = moonPhaseEvents(from, to);
  const events = [
    ...fazy,
    ...superMoonEvents(from, to, fazy),
    ...peakMagnitudeEvents(from, to),
    ...lunarEclipseEvents(from, to),
    ...solarEclipseEvents(from, to, observer),
    ...meteorEvents(from, to),
    ...oppositionEvents(from, to),
    ...elongationEvents(from, to),
    ...seasonEvents(from, to),
    ...(options.includeConjunctions === false
      ? []
      : conjunctionEvents(from, to, observer, {
          stepHours: options.conjunctionStepHours ?? 6,
          includeMoon: options.includeMoonConjunctions !== false,
        })),
  ];
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export const EVENT_LABELS: Record<AstroEvent['kind'], string> = {
  'moon-phase': 'Faza Księżyca',
  'lunar-eclipse': 'Zaćmienie Księżyca',
  'solar-eclipse': 'Zaćmienie Słońca',
  'meteor-shower': 'Rój meteorów',
  opposition: 'Opozycja',
  conjunction: 'Zbliżenie',
  elongation: 'Elongacja',
  season: 'Pora roku',
  apsis: 'Pełnia przy perygeum',
  'peak-magnitude': 'Największa jasność',
};
