/*
 * Ujednolicony opis obiektu nieba.
 *
 * Gwiazda, planeta, obiekt Messiera i gwiazdozbiór mają zupełnie inne dane źródłowe,
 * ale w interfejsie występują w tych samych miejscach: w wynikach wyszukiwania,
 * w panelu szczegółów, na listach. Ten moduł sprowadza je do jednej postaci,
 * żeby komponenty nie musiały znać każdego typu z osobna.
 */

import { BODY_PROFILES } from './astro/constants';
import { angularSeparation, positionOfFixed, toObserver, equatorialFromHorizon } from './astro/ephemeris';
import { bodyState } from './astro/ephemeris';
import { moonState } from './astro/moon';
import { riseSetOf, riseSetOfFixed, startOfLocalDay } from './astro/riseSet';
import type { BodyKey, GeoLocation, NightWindow, RiseSetTimes, Visibility } from './astro/types';
import { cloudFactor, hazeFactor, rateVisibility } from './astro/visibility';
import { fixFor } from './satellites/propagate';
import type { SatelliteRecord } from './satellites/types';
import { bortleInfo } from './catalog/locations';
import type {
  Asterism,
  CatalogBundle,
  ConstellationRecord,
  DeepSkyObject,
  NamedStar,
} from './catalog/types';
import type { SkyObjectRef } from './render/types';

export interface ObjectDetail {
  ref: SkyObjectRef;
  /** Nazwa główna, po polsku jeśli taka istnieje. */
  name: string;
  /** Nazwa dodatkowa: oznaczenie Bayera, numer katalogowy, nazwa międzynarodowa. */
  subtitle: string | null;
  /** Rodzaj obiektu opisany po polsku. */
  kind: string;
  constellation: string | null;
  /** Rektascensja w godzinach i deklinacja w stopniach, epoka J2000. */
  ra: number;
  dec: number;
  magnitude: number | null;
  /** Odległość w latach świetlnych, jeśli znana. */
  distanceLy: number | null;
  /** Odległość w kilometrach, dla ciał Układu Słonecznego. */
  distanceKm: number | null;
  note: string | null;
  /** Dodatkowe pary etykieta i wartość, właściwe dla danego rodzaju obiektu. */
  facts: { label: string; value: string }[];
  altitude: number;
  azimuth: number;
  visibility: Visibility;
  riseSet: RiseSetTimes;
}

const num = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

/** Buduje podpis gwiazdy z oznaczenia Bayera lub Flamsteeda i nazwy gwiazdozbioru. */
function starDesignation(star: NamedStar): string | null {
  const parts: string[] = [];
  if (star.bayerPl && star.conGen) parts.push(`${star.bayerPl} ${star.conGen}`);
  else if (star.flam && star.conGen) parts.push(`${star.flam} ${star.conGen}`);
  if (star.nameIau && star.name !== star.nameIau) parts.push(star.nameIau);
  if (parts.length === 0 && star.hip) parts.push(`HIP ${star.hip}`);
  return parts.length ? parts.join(' , ') : null;
}

export interface ResolveContext {
  catalog: CatalogBundle;
  date: Date;
  location: GeoLocation;
  night: NightWindow;
  /** Stan Księżyca, potrzebny do oceny wpływu jego blasku na tło nieba. */
  moon: { ra: number; dec: number; altitude: number; illumination: number };
  /** Wysokość Słońca w stopniach. Rozstrzyga o jasności tła nieba. */
  sunAltitude: number;
  /** Elementy orbitalne satelitów, potrzebne do opisania klikniętego satelity. */
  satellites: SatelliteRecord[];
  /** Prognoza na tę godzinę. Wartość pusta oznacza brak danych i ocenę bez pogody. */
  weather: { cloudCover: number; visibility: number } | null;
}

/** Wspólne wyliczenie widoczności dla obiektu o stałych współrzędnych. */
/*
 * Ocena warunków dla Słońca.
 *
 * Słońce wymyka się modelowi opartemu na progu widoczności gołym okiem, bo samo ten próg
 * ustala. Zdanie "niebo jest zbyt jasne, żeby zobaczyć Słońce" byłoby oczywistym absurdem.
 * Dla Słońca liczą się więc tylko dwie rzeczy: czy jest nad horyzontem i czy nie zasłaniają
 * go chmury. Do tego ostrzeżenie, bez którego ta ocena byłaby nieodpowiedzialna.
 */
function sunVisibility(ctx: ResolveContext, altitude: number): Visibility {
  if (altitude <= 0) {
    return { score: 0, grade: 'niewidoczne', reason: 'Słońce jest pod horyzontem.', aboveHorizon: false };
  }
  const clouds = cloudFactor(ctx.weather?.cloudCover ?? null);
  const haze = hazeFactor(ctx.weather?.visibility ?? null);
  const height = altitude >= 30 ? 1 : 0.5 + (altitude / 30) * 0.5;
  const score = Math.round(100 * clouds * haze * height);

  const cover = ctx.weather?.cloudCover ?? null;
  let reason: string;
  if (cover !== null && cover >= 85) reason = 'Słońce jest za grubą warstwą chmur.';
  else if (cover !== null && cover >= 40) reason = `Zachmurzenie ${Math.round(cover)} procent, Słońce widoczne z przerwami.`;
  else if (altitude < 10) reason = 'Słońce jest nisko nad horyzontem.';
  else reason = 'Niebo jest czyste.';

  return {
    score,
    grade: score >= 80 ? 'doskonałe' : score >= 60 ? 'dobre' : score >= 38 ? 'umiarkowane' : score >= 12 ? 'trudne' : 'niewidoczne',
    reason: `${reason} Nigdy nie patrz w Słońce bez filtru słonecznego: nawet chwila przez lornetkę albo teleskop trwale uszkadza wzrok.`,
    aboveHorizon: true,
  };
}

function visibilityFor(
  ctx: ResolveContext,
  ra: number,
  dec: number,
  altitude: number,
  magnitude: number | null,
): Visibility {
  return rateVisibility({
    altitude,
    magnitude,
    moonSeparation: angularSeparation(ra, dec, ctx.moon.ra, ctx.moon.dec),
    moonIllumination: ctx.moon.illumination,
    moonUp: ctx.moon.altitude > 0,
    phase: ctx.night.phase,
    sunAltitude: ctx.sunAltitude,
    limitMag: bortleInfo(ctx.location.bortle).limitMag,
    cloudCover: ctx.weather?.cloudCover ?? null,
    horizontalVisibility: ctx.weather?.visibility ?? null,
  });
}

export function resolveStar(star: NamedStar, ctx: ResolveContext): ObjectDetail {
  const observer = toObserver(ctx.location);
  const position = positionOfFixed(star.ra, star.dec, ctx.date, observer);
  const facts: { label: string; value: string }[] = [];
  if (star.spect) facts.push({ label: 'Typ widmowy', value: star.spect });
  if (star.color) facts.push({ label: 'Barwa', value: star.color });
  if (star.absMag !== null) facts.push({ label: 'Jasność absolutna', value: `${num(star.absMag, 2)} mag` });
  if (star.alt?.length) facts.push({ label: 'Inne nazwy', value: star.alt.join(', ') });

  return {
    ref: { kind: 'star', hip: star.hip ?? 0, index: -1 },
    name: star.name ?? starDesignation(star) ?? `HIP ${star.hip}`,
    subtitle: star.name ? starDesignation(star) : null,
    kind: 'gwiazda',
    constellation: star.conPl,
    ra: star.ra,
    dec: star.dec,
    magnitude: star.mag,
    distanceLy: star.distLy,
    distanceKm: null,
    note: star.note,
    facts,
    altitude: position.altitude,
    azimuth: position.azimuth,
    visibility: visibilityFor(ctx, star.ra, star.dec, position.altitude, star.mag),
    riseSet: riseSetOfFixed(
      star.ra,
      star.dec,
      observer,
      startOfLocalDay(ctx.date),
      star.distLy ?? 1000,
    ),
  };
}

export function resolveBody(key: BodyKey, ctx: ResolveContext): ObjectDetail {
  const observer = toObserver(ctx.location);
  const profile = BODY_PROFILES[key];
  const state = key === 'moon' ? moonState(ctx.date, observer) : bodyState(key, ctx.date, observer);
  const conPl = ctx.catalog.constellations.find((c) => c.id === state.constellation)?.pl ?? null;

  const facts: { label: string; value: string }[] = [];
  facts.push({ label: 'Średnica kątowa', value: `${num(state.angularSizeArcsec)}"` });
  if (key !== 'sun') facts.push({ label: 'Elongacja od Słońca', value: `${num(state.elongation)} °` });
  if (key !== 'sun' && key !== 'moon') {
    facts.push({ label: 'Faza tarczy', value: `${Math.round(state.phaseFraction * 100)} %` });
  }
  if (profile.orbitYears) {
    facts.push({ label: 'Okres obiegu', value: `${num(profile.orbitYears, 2)} roku ziemskiego` });
  }
  if (profile.rotationHours) {
    facts.push({
      label: 'Doba',
      value: `${num(Math.abs(profile.rotationHours), 1)} h${profile.rotationHours < 0 ? ' , obrót wsteczny' : ''}`,
    });
  }
  if (profile.moons !== null) facts.push({ label: 'Znane księżyce', value: String(profile.moons) });

  /*
   * Wielkości fizyczne. Średnica zamiast promienia, bo to nią posługują się wszystkie
   * popularne opisy, a masa i grawitacja w odniesieniu do Ziemi, bo liczba kilogramów
   * z dwudziestoma siedmioma zerami nie mówi nikomu nic, natomiast "masa 318 razy
   * większa od Ziemi" mówi wszystko.
   */
  facts.push({
    label: 'Średnica',
    value: `${Math.round(profile.radiusKm * 2).toLocaleString('pl-PL')} km`,
  });
  if (profile.massEarths !== null) {
    facts.push({
      label: 'Masa',
      value:
        profile.massEarths >= 1
          ? `${num(profile.massEarths, profile.massEarths >= 100 ? 0 : 2)} razy Ziemia`
          : `${num(profile.massEarths, 3)} masy Ziemi`,
    });
  }
  if (profile.gravityEarths !== null) {
    facts.push({
      label: 'Grawitacja',
      value: `${num(profile.gravityEarths, 2)} razy ziemska`,
    });
  }
  if (profile.temperatureC !== null) {
    facts.push({
      label: key === 'sun' ? 'Temperatura powierzchni' : 'Średnia temperatura',
      value: `${profile.temperatureC.toLocaleString('pl-PL')} °C`,
    });
  }
  if (profile.distanceAu !== null) {
    facts.push({
      label: 'Odległość od Słońca',
      value: `${num(profile.distanceAu, 3)} au, czyli ${Math.round(profile.distanceAu * 149.6)} mln km`,
    });
  }
  if (profile.composition) facts.push({ label: 'Skład', value: profile.composition });

  return {
    ref: { kind: 'body', key },
    name: profile.name,
    subtitle: profile.kind === 'planet' ? 'planeta' : null,
    kind: profile.kind === 'planet' ? 'planeta' : profile.kind === 'moon' ? 'satelita Ziemi' : 'gwiazda',
    constellation: conPl,
    ra: state.position.ra,
    dec: state.position.dec,
    magnitude: state.magnitude,
    distanceLy: null,
    distanceKm: state.distanceKm,
    note: profile.summary,
    facts,
    altitude: state.position.altitude,
    azimuth: state.position.azimuth,
    visibility:
      key === 'sun'
        ? sunVisibility(ctx, state.position.altitude)
        : visibilityFor(
            ctx,
            state.position.ra,
            state.position.dec,
            state.position.altitude,
            state.magnitude,
          ),
    riseSet: riseSetOf(key, observer, startOfLocalDay(ctx.date)),
  };
}

export function resolveDso(dso: DeepSkyObject, ctx: ResolveContext): ObjectDetail {
  const observer = toObserver(ctx.location);
  const position = positionOfFixed(dso.ra, dso.dec, ctx.date, observer);
  const facts: { label: string; value: string }[] = [];
  if (dso.ngc) facts.push({ label: 'Oznaczenie', value: dso.ngc });
  if (dso.dim) facts.push({ label: 'Rozmiar kątowy', value: `${dso.dim} minut łuku` });
  if (dso.nameEn && dso.nameEn !== dso.name) {
    facts.push({ label: 'Nazwa międzynarodowa', value: dso.nameEn });
  }

  return {
    ref: { kind: 'dso', id: dso.id },
    name: dso.name,
    subtitle: dso.name === dso.id ? null : dso.id,
    kind: dso.typePl,
    constellation: dso.conPl,
    ra: dso.ra,
    dec: dso.dec,
    magnitude: dso.mag,
    distanceLy: null,
    distanceKm: null,
    note: dso.note,
    facts,
    altitude: position.altitude,
    azimuth: position.azimuth,
    visibility: visibilityFor(ctx, dso.ra, dso.dec, position.altitude, dso.mag),
    riseSet: riseSetOfFixed(dso.ra, dso.dec, observer, startOfLocalDay(ctx.date)),
  };
}

export function resolveConstellation(con: ConstellationRecord, ctx: ResolveContext): ObjectDetail {
  const observer = toObserver(ctx.location);
  const [ra, dec] = con.center;
  const position = positionOfFixed(ra, dec, ctx.date, observer);
  const facts: { label: string; value: string }[] = [];
  facts.push({ label: 'Nazwa łacińska', value: con.la });
  if (con.gen) facts.push({ label: 'Dopełniacz łaciński', value: con.gen });
  facts.push({ label: 'Gwiazd w figurze', value: String(con.starCount) });
  if (con.brightest?.name) {
    facts.push({
      label: 'Najjaśniejsza gwiazda',
      value: `${con.brightest.name} , ${num(con.brightest.mag, 2)} mag`,
    });
  }
  if (con.season) facts.push({ label: 'Najlepiej widoczny', value: con.season });

  return {
    ref: { kind: 'constellation', id: con.id },
    name: con.pl,
    subtitle: con.la !== con.pl ? con.la : null,
    kind: 'gwiazdozbiór',
    constellation: null,
    ra,
    dec,
    magnitude: con.brightest?.mag ?? null,
    distanceLy: null,
    distanceKm: null,
    note: null,
    facts,
    altitude: position.altitude,
    azimuth: position.azimuth,
    visibility: visibilityFor(ctx, ra, dec, position.altitude, con.brightest?.mag ?? 3),
    riseSet: riseSetOfFixed(ra, dec, observer, startOfLocalDay(ctx.date)),
  };
}

export function resolveAsterism(ast: Asterism, ctx: ResolveContext): ObjectDetail {
  const observer = toObserver(ctx.location);
  const [ra, dec] = ast.center;
  const position = positionOfFixed(ra, dec, ctx.date, observer);
  const stars = ast.lines.flat().length;
  return {
    ref: { kind: 'asterism', id: ast.id },
    name: ast.pl,
    subtitle: ast.en !== ast.pl ? ast.en : null,
    kind: 'asteryzm',
    constellation: null,
    ra,
    dec,
    magnitude: null,
    distanceLy: null,
    distanceKm: null,
    note: ast.note,
    facts: [
      { label: 'Punktów figury', value: String(stars) },
      { label: 'Rodzaj', value: 'układ zwyczajowy, spoza podziału formalnego' },
    ],
    altitude: position.altitude,
    azimuth: position.azimuth,
    visibility: visibilityFor(ctx, ra, dec, position.altitude, 2),
    riseSet: riseSetOfFixed(ra, dec, observer, startOfLocalDay(ctx.date)),
  };
}

/*
 * Opis satelity.
 *
 * Satelita nie ma stałych współrzędnych, więc pole rektascensji i deklinacji byłoby
 * mylące: za minutę wskazywałoby zupełnie inne miejsce. Wypełniamy je bieżącym
 * położeniem przeliczonym z wysokości i azymutu, a w faktach podajemy to, co przy
 * satelicie faktycznie ma znaczenie: wysokość orbity, odległość i to, czy obiekt
 * jest w cieniu Ziemi.
 */
export function resolveSatellite(record: SatelliteRecord, ctx: ResolveContext): ObjectDetail | null {
  const fix = fixFor(record, ctx.date, {
    lat: ctx.location.lat,
    lon: ctx.location.lon,
    elevation: ctx.location.elevation,
  });
  if (!fix) return null;

  const observer = toObserver(ctx.location);
  const eq = equatorialFromHorizon(fix.azimuth, fix.altitude, ctx.date, observer);

  const facts: { label: string; value: string }[] = [
    { label: 'Wysokość orbity', value: `${Math.round(fix.height)} km nad Ziemią` },
    { label: 'Odległość', value: `${Math.round(fix.range).toLocaleString('pl-PL')} km` },
    { label: 'Oświetlenie', value: fix.sunlit ? 'w świetle Słońca' : 'w cieniu Ziemi' },
    { label: 'Numer katalogowy', value: `NORAD ${record.id}` },
  ];
  /* Prędkość na orbicie kołowej: pierwiastek ze stałej grawitacyjnej Ziemi
   * podzielonej przez promień orbity. Dla niskiej orbity daje około 7.7 km/s. */
  const orbitRadiusKm = 6378.14 + fix.height;
  const speed = Math.sqrt(398600.4418 / orbitRadiusKm);
  facts.push({ label: 'Prędkość', value: `${speed.toFixed(1)} km/s, czyli ${Math.round(speed * 3600)} km/h` });

  return {
    ref: { kind: 'satellite', id: record.id },
    name: record.label ?? record.name,
    subtitle: record.label ? record.name : null,
    kind: 'sztuczny satelita Ziemi',
    constellation: null,
    ra: eq.ra,
    dec: eq.dec,
    magnitude: fix.magnitude,
    distanceLy: null,
    distanceKm: fix.range,
    note: fix.sunlit
      ? 'Satelita jest oświetlony przez Słońce, więc przy dostatecznie ciemnym niebie widać go jako powoli sunący punkt bez migotania.'
      : 'Satelita jest w cieniu Ziemi, więc mimo położenia nad horyzontem nie da się go zobaczyć.',
    facts,
    altitude: fix.altitude,
    azimuth: fix.azimuth,
    visibility: rateVisibility({
      altitude: fix.altitude,
      magnitude: fix.sunlit ? fix.magnitude : 99,
      moonSeparation: null,
      moonIllumination: ctx.moon.illumination,
      moonUp: ctx.moon.altitude > 0,
      phase: ctx.night.phase,
      sunAltitude: ctx.sunAltitude,
      limitMag: bortleInfo(ctx.location.bortle).limitMag,
      cloudCover: ctx.weather?.cloudCover ?? null,
      horizontalVisibility: ctx.weather?.visibility ?? null,
    }),
    /* Satelita obiega Ziemię w półtorej godziny, więc pojęcie wschodu i zachodu
     * w skali doby do niego nie pasuje. Właściwą odpowiedzią są przeloty,
     * a te liczy sekcja Satelity. */
    riseSet: {
      rise: null,
      transit: null,
      set: null,
      transitAltitude: null,
      circumpolar: false,
      neverRises: false,
    },
  };
}

/** Zamienia odwołanie z mapy nieba na pełny opis obiektu. */
export function resolveRef(ref: SkyObjectRef, ctx: ResolveContext): ObjectDetail | null {
  switch (ref.kind) {
    case 'satellite': {
      const record = ctx.satellites.find((s) => s.id === ref.id);
      return record ? resolveSatellite(record, ctx) : null;
    }
    case 'body':
      return resolveBody(ref.key, ctx);
    case 'star': {
      const star = ref.hip ? ctx.catalog.namedByHip.get(ref.hip) : undefined;
      if (star) return resolveStar(star, ctx);
      /* Gwiazda bez wpisu opisowego: budujemy minimalny rekord z katalogu binarnego. */
      if (ref.index >= 0 && ref.index < ctx.catalog.stars.count) {
        const stars = ctx.catalog.stars;
        const synthetic: NamedStar = {
          hip: ref.hip || null,
          name: null,
          nameIau: null,
          alt: null,
          bayer: null,
          bayerPl: null,
          flam: null,
          con: null,
          conPl: null,
          conGen: null,
          ra: (stars.ra[ref.index] * 180) / Math.PI / 15,
          dec: (stars.dec[ref.index] * 180) / Math.PI,
          mag: stars.mag[ref.index],
          absMag: null,
          distLy: null,
          spect: null,
          spectClass: null,
          color: null,
          note: null,
        };
        return resolveStar(synthetic, ctx);
      }
      return null;
    }
    case 'dso': {
      const dso = ctx.catalog.dso.find((d) => d.id === ref.id);
      return dso ? resolveDso(dso, ctx) : null;
    }
    case 'constellation': {
      const con = ctx.catalog.constellations.find((c) => c.id === ref.id);
      return con ? resolveConstellation(con, ctx) : null;
    }
    case 'asterism': {
      const ast = ctx.catalog.asterisms.find((a) => a.id === ref.id);
      return ast ? resolveAsterism(ast, ctx) : null;
    }
  }
}
