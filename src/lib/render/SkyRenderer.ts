import { Observer } from 'astronomy-engine';

import { Illumination, JupiterMoons } from 'astronomy-engine';

import { BODY_MAP, BODY_PROFILES, ALL_BODY_KEYS } from '@/lib/astro/constants';
import { positionOf, toObserver } from '@/lib/astro/ephemeris';
import type { BodyKey } from '@/lib/astro/types';
import {
  altAzToVector,
  createHorizontalBuffer,
  pointToHorizon,
  projectCatalogToHorizon,
  skyRotation,
  vectorToAltAz,
  type HorizontalBuffer,
  type SkyRotation,
} from '@/lib/catalog/horizontal';
import type { CatalogBundle } from '@/lib/catalog/types';

import {
  drawMilkyWayToBuffer,
  horizonToGalactic,
  loadMilkyWayTexture,
  type MilkyWayTexture,
} from './layers/milkyway';
import { drawSaturnRings, PlanetDiscCache, saturnRings } from './layers/planets';
import { rgb, skyTint, type SkyTint } from './layers/skyBackground';

/*
 * Barwa nieba w pełnej nocy. Ta sama, którą skyBackground podaje przy Słońcu
 * osiemnaście stopni pod horyzontem, czyli po zmierzchu astronomicznym.
 * Wypełniamy nią obszar pod horyzontem niezależnie od pory doby.
 */
const NIGHT_ZENITH: [number, number, number] = [10, 13, 22];
import {
  ridgeAltitude,
  RIDGES,
  terrainAltitude,
  TERRAIN_MAX,
  type Ridge,
} from './layers/terrain';
import { fixesAbove } from '@/lib/satellites/propagate';
import type { SatelliteFix } from '@/lib/satellites/types';
import { SkyProjection, type ProjectedPoint } from './projection';
import {
  BUCKET_COUNT,
  BUCKET_CSS,
  GlowCache,
  colorBucket,
  limitMagnitudeForFov,
  starRadius,
} from './sprites';
import type { HitTarget, SkyObjectRef, SkyRenderInput } from './types';

const MAX_DPR = 2;
/* Ile razy mniejszy jest bufor pomocniczy Drogi Mlecznej od obszaru rysowania. */
/*
 * Docelowa szerokość bufora Drogi Mlecznej w pikselach.
 *
 * Wcześniej był tu stały dzielnik i to było źle postawione pytanie. Dzielnik trzy
 * na telefonie daje bufor szeroki na dwieście pięćdziesiąt pikseli, a na monitorze
 * na dziewięćset: ten sam zapis, dwa zupełnie różne wyniki, w dodatku odwrotnie
 * niż potrzeba, bo to na dużym ekranie pas zajmuje więcej miejsca i wymaga więcej
 * szczegółu.
 *
 * Teraz pytamy o rozdzielczość wprost. Tysiąc dwieście pikseli szerokości wystarcza,
 * żeby na monitorze widać było ciemne pasma pyłu i pojedyncze obłoki, a nie plamy,
 * i jednocześnie nie rośnie w nieskończoność razem z oknem. Dzielnik nigdy nie schodzi
 * poniżej dwóch, bo bufor większy od połowy obszaru rysowania nie dodaje już niczego:
 * pas jest z natury miękki i jego rozciągnięcie działa jak rozmycie, które i tak
 * byłoby potrzebne.
 */
const MW_TARGET_WIDTH = 1200;
const D2R = Math.PI / 180;

/* Siatka zajętości używana przy rozmieszczaniu podpisów. Komórka ma 46 na 18 pikseli. */
const LABEL_CELL_W = 46;
const LABEL_CELL_H = 18;

/*
 * Promień tarczy przy typowym kadrze, w pikselach.
 * Wartości oddają wzajemne proporcje jasności i wielkości ciał, a nie ich
 * rzeczywistą skalę, która przy szerokim polu widzenia byłaby niewidoczna.
 */
const BASE_DISC_RADIUS: Record<BodyKey, number> = {
  sun: 5,
  moon: 6,
  mercury: 2.6,
  venus: 3.8,
  mars: 3,
  jupiter: 4,
  saturn: 3.6,
  uranus: 2.4,
  neptune: 2.2,
};

/*
 * Kąt pozycyjny jasnego brzegu, wzór Meeusa.
 * Mówi, w którą stronę nieba zwrócona jest oświetlona część tarczy,
 * licząc od północy w kierunku wschodu.
 */
function brightLimb(sunRa: number, sunDec: number, bodyRa: number, bodyDec: number): number {
  const raSun = sunRa * 15 * D2R;
  const decSun = sunDec * D2R;
  const raBody = bodyRa * 15 * D2R;
  const decBody = bodyDec * D2R;
  const dRa = raSun - raBody;
  const y = Math.cos(decSun) * Math.sin(dRa);
  const x = Math.sin(decSun) * Math.cos(decBody) - Math.cos(decSun) * Math.sin(decBody) * Math.cos(dRa);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

/** Obraz horyzontu na ekranie: okrąg albo, w przypadku granicznym, prosta pozioma. */
type HorizonGeometry =
  | { kind: 'circle'; x: number; y: number; radius: number; groundOutside: boolean }
  | { kind: 'line'; y: number; groundBelow: boolean };

interface BodyDraw {
  key: BodyKey;
  n: number;
  w: number;
  u: number;
  magnitude: number;
  /** Widoczna średnica kątowa w stopniach. */
  angularSizeDeg: number;
  /** Ułamek tarczy oświetlony, od 0 do 1. */
  phaseFraction: number;
  /** Kąt pozycyjny jasnego brzegu w stopniach, liczony od północy ku wschodowi. */
  brightLimbAngle: number;
  /** Kąt otwarcia pierścieni Saturna w stopniach. */
  ringTilt: number;
}

export class SkyRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private catalog: CatalogBundle;
  private projection = new SkyProjection();
  private glow = new GlowCache();
  private planetDiscs = new PlanetDiscCache();
  /* Płótno pomocnicze do nałożenia fazy na tarczę bez zamalowywania nieba pod nią. */
  private discScratch: HTMLCanvasElement | null = null;
  private discScratchCtx: CanvasRenderingContext2D | null = null;
  private milkyWayTexture: MilkyWayTexture | null = null;
  private milkyWayRequested = false;
  /* Obrót z układu horyzontalnego do galaktycznego, przeliczany razem z efemerydami. */
  private galacticMatrix = new Float64Array(9);
  /* Bufor pomocniczy dla Drogi Mlecznej, celowo w obniżonej rozdzielczości. */
  private mwCanvas: HTMLCanvasElement | null = null;
  private mwCtx: CanvasRenderingContext2D | null = null;
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainCtx: CanvasRenderingContext2D | null = null;
  private mwImage: ImageData | null = null;

  private horizontal: HorizontalBuffer;
  private rotation: SkyRotation;
  private observer: Observer;

  private input: SkyRenderInput;
  private dpr = 1;
  private width = 0;
  private height = 0;

  /* Klucz opisujący, dla jakiego czasu i miejsca policzone są pozycje horyzontalne. */
  private ephemerisKey = '';
  /* Satelity przeliczamy częściej niż resztę efemeryd, bo przelot trwa minuty,
   * a nie godziny. Osobny klucz pozwala zejść z krokiem do jednej sekundy,
   * nie zmuszając do przeliczania całego katalogu gwiazd. */
  private satelliteKey = '';
  private satelliteFixes: SatelliteFix[] = [];
  private sunAltitude = -90;
  private tint: SkyTint;
  private bodies: BodyDraw[] = [];
  /* Położenia księżyców galileuszowych względem Jowisza, w promieniach planety.
   * Liczone razem z resztą efemeryd, bo to pełne obliczenie orbitalne. */
  private jupiterMoons: { x: number; y: number; name: string }[] = [];

  private targets: HitTarget[] = [];
  private labelGrid: Uint8Array = new Uint8Array(0);
  private labelCols = 0;
  private labelRows = 0;

  private point: ProjectedPoint = { x: 0, y: 0, depth: 0 };
  private point2: ProjectedPoint = { x: 0, y: 0, depth: 0 };

  /** Czas rysowania ostatniej klatki w milisekundach, do pomiarów wydajności. */
  lastFrameMs = 0;

  constructor(canvas: HTMLCanvasElement, catalog: CatalogBundle, input: SkyRenderInput) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nie udało się utworzyć kontekstu rysowania.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.catalog = catalog;
    this.input = input;
    this.horizontal = createHorizontalBuffer(catalog.stars.count);
    this.observer = toObserver(input.location);
    this.rotation = skyRotation(input.date, this.observer);
    this.tint = skyTint(-90);
    this.updateEphemeris(true);
  }

  /* Panorama Drogi Mlecznej wczytuje się leniwie, przy pierwszym użyciu warstwy.
   * Do czasu jej pobrania mapa rysuje się normalnie, tylko bez tej jednej warstwy. */
  private ensureMilkyWayTexture(): void {
    if (this.milkyWayTexture || this.milkyWayRequested) return;
    this.milkyWayRequested = true;
    void loadMilkyWayTexture().then((texture) => {
      this.milkyWayTexture = texture;
    });
  }

  setInput(input: SkyRenderInput): void {
    const locationChanged =
      input.location.lat !== this.input.location.lat ||
      input.location.lon !== this.input.location.lon ||
      input.location.elevation !== this.input.location.elevation;
    this.input = input;
    if (locationChanged) this.observer = toObserver(input.location);
    this.updateEphemeris(locationChanged);
  }

  /*
   * Pozycje horyzontalne przeliczamy wyłącznie przy zmianie czasu lub miejsca obserwacji.
   * Przesuwanie i przybliżanie mapy nie dotyka tej ścieżki, bo zmienia tylko projekcję.
   *
   * Krok czasu jest dobierany do prędkości przewijania. Niebo obraca się piętnaście sekund
   * łuku na sekundę czasu rzeczywistego, więc przy podglądzie na żywo krok dwusekundowy
   * daje przeskok trzydziestu sekund łuku, czyli ułamek piksela. Przy przewijaniu
   * sto razy szybszym ten sam krok dałby już przeskok całego stopnia i widoczne szarpanie,
   * dlatego krok maleje odwrotnie proporcjonalnie do mnożnika. Pełne przeliczenie kosztuje
   * około 0.4 ms, więc nawet w każdej klatce mieści się w budżecie.
   */
  private updateEphemeris(force: boolean): void {
    const { date, location } = this.input;
    const scale = Math.max(1, Math.abs(this.input.timeScale));
    const quantum = Math.max(16, 2000 / scale);
    const key = `${Math.round(date.getTime() / quantum)}:${location.lat.toFixed(4)}:${location.lon.toFixed(4)}:${Math.round(location.elevation)}`;
    if (!force && key === this.ephemerisKey) return;
    this.ephemerisKey = key;

    this.rotation = skyRotation(date, this.observer);
    projectCatalogToHorizon(this.catalog.stars, this.rotation, this.horizontal);
    horizonToGalactic(this.rotation, this.galacticMatrix);

    const sun = positionOf('sun', date, this.observer);
    this.sunAltitude = sun.altitude;
    this.tint = skyTint(sun.altitude);

    /*
     * Stan każdego ciała: kierunek, jasność, faza i kąt jasnego rąbka.
     * Kąt liczymy wzorem Meeusa z położeń Słońca i danego ciała, bo mówi on,
     * w którą stronę nieba zwrócona jest oświetlona część tarczy. Bez niego
     * sierp Wenus wskazywałby przypadkowy kierunek.
     */
    const sunEq = positionOf('sun', date, this.observer);
    this.bodies = ALL_BODY_KEYS.map((key2) => {
      const pos = positionOf(key2, date, this.observer);
      const v = altAzToVector(pos.azimuth, pos.altitude);
      const profile = BODY_PROFILES[key2];

      let phaseFraction = 1;
      let magnitude = 0;
      let ringTilt = 0;
      let distanceKm = 1;
      if (key2 !== 'sun') {
        const illum = Illumination(BODY_MAP[key2], date);
        phaseFraction = illum.phase_fraction;
        magnitude = illum.mag;
        ringTilt = illum.ring_tilt ?? 0;
        distanceKm = illum.geo_dist * 149597870.7;
      } else {
        magnitude = -26.7;
        distanceKm = 149597870.7;
      }

      return {
        key: key2,
        n: v.n,
        w: v.w,
        u: v.u,
        magnitude,
        angularSizeDeg: (2 * profile.radiusKm) / distanceKm / D2R,
        phaseFraction,
        brightLimbAngle: brightLimb(sunEq.ra, sunEq.dec, pos.ra, pos.dec),
        ringTilt,
      };
    });

    /* Księżyce galileuszowe. Ich położenia to pełne obliczenie orbitalne,
     * więc liczymy je razem z resztą efemeryd, a nie przy każdej klatce. */
    const jm = JupiterMoons(date);
    const jupiterRadiusAu = 71492 / 149597870.7;
    this.jupiterMoons = [
      { state: jm.io, name: 'Io' },
      { state: jm.europa, name: 'Europa' },
      { state: jm.ganymede, name: 'Ganimedes' },
      { state: jm.callisto, name: 'Kallisto' },
    ].map(({ state, name }) => ({
      x: state.x / jupiterRadiusAu,
      y: state.y / jupiterRadiusAu,
      name,
    }));


  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.labelCols = Math.ceil(width / (LABEL_CELL_W * dpr)) + 1;
    this.labelRows = Math.ceil(height / (LABEL_CELL_H * dpr)) + 1;
    this.labelGrid = new Uint8Array(this.labelCols * this.labelRows);

    /* Bufor Drogi Mlecznej ma rozdzielczość obniżoną trzykrotnie. Skalowanie go
     * w górę przy rysowaniu działa jak rozmycie, dzięki czemu z pojedynczych plam
     * powstaje ciągła poświata bez widocznej siatki punktów. */
    if (!this.mwCanvas) {
      this.mwCanvas = document.createElement('canvas');
      this.mwCtx = this.mwCanvas.getContext('2d', { alpha: true });
    }
    const mwScale = Math.max(2, Math.min(6, width / MW_TARGET_WIDTH));
    this.mwCanvas.width = Math.max(1, Math.ceil(width / mwScale));
    this.mwCanvas.height = Math.max(1, Math.ceil(height / mwScale));
    this.mwImage = this.mwCtx
      ? this.mwCtx.createImageData(this.mwCanvas.width, this.mwCanvas.height)
      : null;

    /*
     * Bufor terenu w pełnej rozdzielczości.
     *
     * Plany terenu rysujemy w nim nieprzezroczyście, a dopiero gotowy obraz
     * przenosimy na płótno z przezroczystością zależną od głębokości. Gdyby
     * rysować je wprost na płótnie z przezroczystością, każdy kolejny plan
     * nakładałby się na poprzedni i grunt robiłby się coraz bardziej kryjący
     * w dół, czyli dokładnie odwrotnie, niż ma być.
     */
    if (!this.terrainCanvas) {
      this.terrainCanvas = document.createElement('canvas');
      this.terrainCtx = this.terrainCanvas.getContext('2d', { alpha: true });
    }
    this.terrainCanvas.width = Math.max(1, width);
    this.terrainCanvas.height = Math.max(1, height);
  }

  /* Rezerwuje miejsce na podpis. Zwraca fałsz, gdy miejsce jest już zajęte. */
  private claimLabel(x: number, y: number, textWidth: number): boolean {
    const cellW = LABEL_CELL_W * this.dpr;
    const cellH = LABEL_CELL_H * this.dpr;
    const c0 = Math.floor(x / cellW);
    const c1 = Math.floor((x + textWidth) / cellW);
    const r0 = Math.floor((y - cellH * 0.5) / cellH);
    const r1 = Math.floor((y + cellH * 0.5) / cellH);
    if (c1 < 0 || r1 < 0 || c0 >= this.labelCols || r0 >= this.labelRows) return false;
    for (let r = Math.max(0, r0); r <= Math.min(this.labelRows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.labelCols - 1, c1); c++) {
        if (this.labelGrid[r * this.labelCols + c]) return false;
      }
    }
    for (let r = Math.max(0, r0); r <= Math.min(this.labelRows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.labelCols - 1, c1); c++) {
        this.labelGrid[r * this.labelCols + c] = 1;
      }
    }
    return true;
  }

  render(): void {
    const started = performance.now();
    const { ctx, projection, input } = this;
    if (this.width === 0 || this.height === 0) return;

    projection.azimuth = input.view.azimuth;
    projection.altitude = input.view.altitude;
    projection.fov = input.view.fov;
    projection.update(this.width, this.height);

    this.targets.length = 0;
    this.labelGrid.fill(0);

    const horizon = this.horizonGeometry();
    this.drawBackground(horizon);
    if (input.layers.horizon) this.drawSubHorizonSky(horizon);
    if (input.layers.milkyWay) this.drawMilkyWay();
    if (input.layers.grid) this.drawGrid();
    if (input.layers.boundaries) this.drawBoundaries();
    if (input.layers.constellations) this.drawConstellationLines();
    if (input.layers.asterisms) this.drawAsterisms();
    if (input.layers.deepSky) this.drawDeepSky();
    this.drawStars();
    if (input.layers.starNames) this.drawStarLabels();
    if (input.layers.constellationNames) this.drawConstellationLabels();
    this.drawBodies();
    /* Powyżej dziesięciu minut na sekundę satelita przelatuje całe niebo w ułamku klatki,
     * więc warstwa pokazywałaby przypadkowe punkty. Wtedy ją wygaszamy. */
    if (input.layers.satellites && Math.abs(input.timeScale) <= 600) {
      this.updateSatellites();
      this.drawSatellites();
    }
    /* Grunt przykrywa wszystko, co znalazło się pod horyzontem. Musi więc lecieć
     * po treści nieba, a nie przed nią, inaczej linie figur i granice prześwitują. */
    if (input.layers.horizon) this.drawGround(horizon);
    this.drawSelection();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lastFrameMs = performance.now() - started;
  }

  /*
   * Geometria horyzontu.
   *
   * Projekcja stereograficzna odwzorowuje okręgi na sferze w okręgi na płaszczyźnie,
   * więc horyzont ma na ekranie postać okręgu, który da się policzyć wprost,
   * bez próbkowania i bez sklejania odcinków.
   *
   * Wyprowadzenie: dla punktu v jego rzut spełnia v.F = (4 - s) / (4 + s), gdzie s to
   * kwadrat odległości od środka kadru w jednostkach projekcji. Podstawiając warunek
   * horyzontu v.z = 0 i zapisując zenit w bazie kamery jako (0, cos h, sin h),
   * otrzymujemy równanie okręgu o środku w punkcie (0, 2 ctg h) i promieniu 2 / |sin h|.
   *
   * Przy kierunku patrzenia dokładnie w horyzont promień rośnie do nieskończoności
   * i okrąg przechodzi w prostą poziomą przez środek kadru, co obsługujemy osobno.
   *
   * Strona gruntu wynika ze znaku: patrząc w górę grunt leży na zewnątrz okręgu,
   * patrząc w dół leży w jego wnętrzu.
   */
  private horizonGeometry(): HorizonGeometry {
    const { projection } = this;
    const altRad = projection.altitude * (Math.PI / 180);
    const sin = Math.sin(altRad);

    if (Math.abs(sin) < 1e-4) {
      return { kind: 'line', y: projection.cy, groundBelow: Math.cos(altRad) > 0 };
    }

    return {
      kind: 'circle',
      x: projection.cx,
      y: projection.cy - (2 / Math.tan(altRad)) * projection.scale,
      radius: (2 / Math.abs(sin)) * projection.scale,
      groundOutside: sin > 0,
    };
  }

  /* Buduje ścieżkę pokrywającą obszar pod horyzontem. */
  private groundPath(geometry: HorizonGeometry): { path: Path2D; rule: CanvasFillRule } {
    const path = new Path2D();
    if (geometry.kind === 'line') {
      if (geometry.groundBelow) path.rect(0, geometry.y, this.width, this.height - geometry.y);
      else path.rect(0, 0, this.width, geometry.y);
      return { path, rule: 'nonzero' };
    }

    path.arc(geometry.x, geometry.y, geometry.radius, 0, Math.PI * 2);
    if (geometry.groundOutside) {
      /* Prostokąt całego kadru razem z okręgiem i regułą parzystości daje
       * dokładnie obszar poza okręgiem, także wtedy, gdy okrąg wychodzi poza ekran. */
      path.rect(0, 0, this.width, this.height);
      return { path, rule: 'evenodd' };
    }
    return { path, rule: 'nonzero' };
  }

  /*
   * Niebo pod horyzontem.
   *
   * Grunt nie jest ścianą. Pod nogami obserwatora niebo istnieje dalej, tyle że
   * przesłania je Ziemia, a mapa nieba, która to niebo wycina, traci połowę treści
   * i sprawia wrażenie, jakby świat kończył się na linii horyzontu.
   *
   * Dlatego obszar pod horyzontem zamalowujemy barwą nocnego nieba, jeszcze zanim
   * padną na niego gwiazdy, figury i Droga Mleczna. W dzień odcina to jasną łunę
   * dnia od części, której i tak nie widać, a nocą nie zmienia nic, bo obie barwy
   * są wtedy niemal identyczne. Sam teren kładziemy później, półprzezroczyście,
   * więc niebo pod horyzontem prześwituje przez ziemię tym mocniej, im głębiej.
   */
  private drawSubHorizonSky(horizon: HorizonGeometry): void {
    const { ctx } = this;
    const { path, rule } = this.groundPath(horizon);
    ctx.save();
    ctx.fillStyle = rgb(NIGHT_ZENITH);
    ctx.fill(path, rule);
    ctx.restore();
  }

  private drawBackground(horizon: HorizonGeometry): void {
    const { ctx, tint } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgb(tint.zenith);
    ctx.fillRect(0, 0, this.width, this.height);

    /* Rozjaśnienie przy horyzoncie. W projekcji stereograficznej wysokość maleje
     * promieniście od punktu zenitu, więc gradient promienisty wokół zenitu
     * odwzorowuje rzeczywisty rozkład jasności nieba. Promień bierzemy wprost
     * z geometrii horyzontu, a nie z próbkowania. */
    if (this.projection.project(0, 0, 1, this.point)) {
      const zx = this.point.x;
      const zy = this.point.y;
      const radius =
        horizon.kind === 'circle'
          ? Math.hypot(horizon.x - zx, horizon.y - zy) + horizon.radius * (horizon.groundOutside ? 0 : 1)
          : Math.hypot(this.width, this.height);
      const span =
        horizon.kind === 'circle' && horizon.groundOutside
          ? horizon.radius - Math.hypot(horizon.x - zx, horizon.y - zy)
          : radius;
      if (span > 8 && Number.isFinite(span)) {
        const g = ctx.createRadialGradient(zx, zy, span * 0.25, zx, zy, span * 1.06);
        g.addColorStop(0, rgb(tint.zenith, 0));
        g.addColorStop(0.72, rgb(tint.horizon, 0.34));
        g.addColorStop(1, rgb(tint.horizon, 0.92));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    /* Poświata zmierzchowa w miejscu, w którym Słońce znajduje się pod horyzontem. */
    if (this.input.layers.atmosphere && tint.glow > 0.02) {
      const sun = this.bodies.find((b) => b.key === 'sun');
      if (sun) {
        const anchor = this.sunAltitude < 0 ? projectGlowAnchor(sun) : sun;
        if (this.projection.project(anchor.n, anchor.w, anchor.u, this.point)) {
          const r = Math.max(this.width, this.height) * (0.42 + tint.glow * 0.5);
          const g = ctx.createRadialGradient(this.point.x, this.point.y, 0, this.point.x, this.point.y, r);
          g.addColorStop(0, rgb(tint.glowColor, 0.5 * tint.glow));
          g.addColorStop(0.35, rgb(tint.glowColor, 0.2 * tint.glow));
          g.addColorStop(1, rgb(tint.glowColor, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, this.width, this.height);
        }
      }
    }
  }

  /*
   * Droga Mleczna.
   *
   * Warstwa trafia najpierw do bufora o rozdzielczości obniżonej czterokrotnie,
   * a dopiero potem, przeskalowana w górę z wygładzaniem, na główny obszar rysowania.
   * Obniżona rozdzielczość jest tu zaletą: pas jest z natury miękki, a wypełniamy
   * szesnaście razy mniej pikseli.
   *
   * Widoczność zależy od zanieczyszczenia nieba światłem. Z miejsca o skali Bortle'a
   * równej 3 pas jest wyraźny, przy 6 ledwie dostrzegalny, od 8 w górę znika zupełnie.
   * To odwzorowanie tego, co obserwator faktycznie zobaczy, a nie efekt ozdobny.
   */
  private drawMilkyWay(): void {
    this.ensureMilkyWayTexture();
    const texture = this.milkyWayTexture;
    const buffer = this.mwCtx;
    const bufferCanvas = this.mwCanvas;
    const image = this.mwImage;
    if (!texture || !buffer || !bufferCanvas || !image) return;

    const bortle = this.input.location.bortle ?? 6;
    const darkness = Math.max(0, Math.min(1, (7.6 - bortle) / 4.4));
    /*
     * Panorama ma rozdzielczość około jednej trzeciej stopnia na piksel.
     * Przy silnym przybliżeniu byłaby rozciągnięta na kilkanaście pikseli ekranu
     * i zamiast obłoków pokazywałaby kwadraty, dlatego wygaszamy ją płynnie.
     * Fizycznie nic nie tracimy: przy wąskim kadrze i tak patrzy się na gwiazdy,
     * a nie na rozmyty blask tła.
     */
    const zoomFade = Math.max(0, Math.min(1, (this.projection.fov - 12) / 28));
    const strength = (1 - this.tint.washout) * darkness * zoomFade * 0.92;
    if (strength <= 0.02) return;

    buffer.setTransform(1, 0, 0, 1, 0, 0);

    const drawn = drawMilkyWayToBuffer({
      ctx: buffer,
      width: bufferCanvas.width,
      height: bufferCanvas.height,
      /* Dzielnik odczytany z faktycznych wymiarów bufora, żeby odwzorowanie zgadzało się
       * z tym, ile pikseli naprawdę przypada na piksel ekranu. */
      downscale: this.width / bufferCanvas.width,
      unproject: (x, y) => this.projection.unproject(x, y),
      matrix: this.galacticMatrix,
      texture,
      strength,
      /* Pas prowadzimy dalej pod horyzont, bo ziemia go tylko przesłania,
       * a nie ucina. Tak samo jak gwiazdy. */
      clipToHorizon: false,
      image,
    });
    if (!drawn) return;

    const { ctx } = this;
    ctx.save();
    /* Tryb rozjaśniania, bo pas dodaje światła do tła nieba, a nie zastępuje go. */
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bufferCanvas, 0, 0, this.width, this.height);
    ctx.restore();
  }

  private drawGrid(): void {
    const { ctx, projection } = this;
    ctx.save();
    ctx.strokeStyle = 'rgb(148 168 210 / 0.16)';
    ctx.lineWidth = 1 * this.dpr;

    /* Almukantaraty, czyli okręgi stałej wysokości. */
    for (let alt = -60; alt <= 80; alt += 20) {
      ctx.beginPath();
      let started = false;
      for (let az = 0; az <= 360; az += 2) {
        const v = altAzToVector(az, alt);
        if (projection.project(v.n, v.w, v.u, this.point)) {
          if (started) ctx.lineTo(this.point.x, this.point.y);
          else {
            ctx.moveTo(this.point.x, this.point.y);
            started = true;
          }
        } else started = false;
      }
      ctx.stroke();
    }

    /* Wertykały, czyli półokręgi stałego azymutu. */
    for (let az = 0; az < 360; az += 30) {
      ctx.beginPath();
      let started = false;
      for (let alt = -80; alt <= 88; alt += 2) {
        const v = altAzToVector(az, alt);
        if (projection.project(v.n, v.w, v.u, this.point)) {
          if (started) ctx.lineTo(this.point.x, this.point.y);
          else {
            ctx.moveTo(this.point.x, this.point.y);
            started = true;
          }
        } else started = false;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawConstellationLines(): void {
    const { ctx, projection, rotation } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.05) return;
    ctx.save();
    ctx.strokeStyle = `rgb(150 178 232 / ${0.3 * fade})`;
    ctx.lineWidth = 1 * this.dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const con of this.catalog.constellations) {
      for (const line of con.lines) {
        let started = false;
        for (const [ra, dec] of line) {
          const v = pointToHorizon(ra, dec, rotation);
          if (v.u < -0.08 || !projection.project(v.n, v.w, v.u, this.point)) {
            started = false;
            continue;
          }
          if (started) ctx.lineTo(this.point.x, this.point.y);
          else {
            ctx.moveTo(this.point.x, this.point.y);
            started = true;
          }
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /*
   * Granice gwiazdozbiorów.
   *
   * Rysujemy je cienką, przygaszoną linią przerywaną, bo to informacja porządkowa,
   * a nie element obrazu nieba. Mają być czytelne wtedy, gdy ktoś ich szuka,
   * i niewidoczne dla reszty.
   */
  private drawBoundaries(): void {
    const { ctx, projection, rotation } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.06) return;
    ctx.save();
    ctx.strokeStyle = `rgb(126 150 200 / ${0.24 * fade})`;
    ctx.lineWidth = 1 * this.dpr;
    ctx.setLineDash([3 * this.dpr, 4 * this.dpr]);
    ctx.beginPath();
    for (const line of this.catalog.boundaries) {
      let started = false;
      for (const [ra, dec] of line) {
        const v = pointToHorizon(ra, dec, rotation);
        if (v.u < -0.12 || !projection.project(v.n, v.w, v.u, this.point)) {
          started = false;
          continue;
        }
        if (started) ctx.lineTo(this.point.x, this.point.y);
        else {
          ctx.moveTo(this.point.x, this.point.y);
          started = true;
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /*
   * Asteryzmy rysujemy inaczej niż gwiazdozbiory: jaśniejszą, ale przerywaną linią.
   * Dzięki temu na jednej mapie da się odróżnić figurę formalną od zwyczajowej,
   * nawet gdy obie warstwy są włączone naraz.
   */
  private drawAsterisms(): void {
    const { ctx, projection, rotation } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.06) return;
    ctx.save();
    ctx.strokeStyle = `rgb(226 178 96 / ${0.46 * fade})`;
    ctx.lineWidth = 1.3 * this.dpr;
    ctx.setLineDash([7 * this.dpr, 5 * this.dpr]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const ast of this.catalog.asterisms) {
      for (const line of ast.lines) {
        let started = false;
        for (const [ra, dec] of line) {
          const v = pointToHorizon(ra, dec, rotation);
          if (v.u < -0.08 || !projection.project(v.n, v.w, v.u, this.point)) {
            started = false;
            continue;
          }
          if (started) ctx.lineTo(this.point.x, this.point.y);
          else {
            ctx.moveTo(this.point.x, this.point.y);
            started = true;
          }
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* Podpisy asteryzmów tylko przy umiarkowanym przybliżeniu. */
    if (projection.fov > 110 || projection.fov < 10) return;
    ctx.save();
    ctx.font = `500 ${Math.round(10.5 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgb(226 178 96 / ${0.6 * fade})`;
    for (const ast of this.catalog.asterisms) {
      const v = pointToHorizon(ast.center[0], ast.center[1], rotation);
      if (v.u < 0.06) continue;
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < 0 || y < 0 || x > this.width || y > this.height) continue;
      const width = ctx.measureText(ast.pl).width;
      if (!this.claimLabel(x - width / 2, y, width)) continue;
      ctx.fillText(ast.pl, x - width / 2, y);
      this.targets.push({
        ref: { kind: 'asterism', id: ast.id },
        x,
        y,
        radius: Math.max(18, width / 2) * this.dpr,
        label: ast.pl,
        priority: 3,
      });
    }
    ctx.restore();
  }

  private drawConstellationLabels(): void {
    const { ctx, projection, rotation } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.1) return;
    /* Przy dużym przybliżeniu podpisy gwiazdozbiorów tracą sens, bo w kadrze
     * mieści się tylko fragment figury. */
    if (projection.fov < 14) return;

    ctx.save();
    ctx.font = `${Math.round(11 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgb(168 190 236 / ${0.5 * fade})`;
    const sorted = [...this.catalog.constellations].sort((a, b) => a.rank - b.rank);
    for (const con of sorted) {
      const v = pointToHorizon(con.center[0], con.center[1], rotation);
      if (v.u < 0.06) continue;
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < 0 || y < 0 || x > this.width || y > this.height) continue;
      const text = con.pl.toUpperCase();
      const width = ctx.measureText(text).width;
      if (!this.claimLabel(x - width / 2, y, width)) continue;
      ctx.letterSpacing = '0.14em';
      ctx.fillText(text, x - width / 2, y);
      ctx.letterSpacing = '0px';
      this.targets.push({
        ref: { kind: 'constellation', id: con.id },
        x,
        y,
        radius: Math.max(20, width / 2) * this.dpr,
        label: con.pl,
        priority: 3,
      });
    }
    ctx.restore();
  }

  private drawDeepSky(): void {
    const { ctx, projection, rotation } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.06) return;
    /* Podpisy obiektów mgławicowych mają sens dopiero przy węższym kadrze,
     * inaczej zasłaniają gwiazdy i tworzą szum. */
    const showLabels = projection.fov < 55;
    ctx.save();
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.font = `${Math.round(10 * this.dpr)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';

    for (const obj of this.catalog.dso) {
      const v = pointToHorizon(obj.ra, obj.dec, rotation);
      if (v.u < 0) continue;
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < -20 || y < -20 || x > this.width + 20 || y > this.height + 20) continue;

      const r = Math.max(2.6, Math.min(7.5, 4.2 + (7 - (obj.mag ?? 8)) * 0.55)) * this.dpr;
      ctx.strokeStyle = `rgb(132 190 208 / ${0.42 * fade})`;

      ctx.beginPath();
      if (obj.cat === 'galaktyka') {
        /* Elipsa nachylona, bo tak wygląda dysk galaktyki widziany pod kątem. */
        ctx.ellipse(x, y, r * 1.3, r * 0.6, Math.PI / 5, 0, Math.PI * 2);
      } else if (obj.cat === 'gromada') {
        /* Okrąg przerywany, umownie oznaczający zbiorowisko gwiazd. */
        ctx.setLineDash([2 * this.dpr, 2.6 * this.dpr]);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      } else {
        /* Romb dla mgławic. Kwadrat czytał się zbyt ciężko na tle gwiazd. */
        ctx.moveTo(x, y - r * 1.15);
        ctx.lineTo(x + r * 1.15, y);
        ctx.lineTo(x, y + r * 1.15);
        ctx.lineTo(x - r * 1.15, y);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (showLabels) {
        const width = ctx.measureText(obj.id).width;
        if (this.claimLabel(x + r + 4 * this.dpr, y, width)) {
          ctx.fillStyle = `rgb(132 190 208 / ${0.66 * fade})`;
          ctx.fillText(obj.id, x + r + 4 * this.dpr, y);
        }
      }

      this.targets.push({
        ref: { kind: 'dso', id: obj.id },
        x,
        y,
        radius: Math.max(r, 9 * this.dpr),
        label: obj.name,
        priority: 2,
      });
    }
    ctx.restore();
  }

  private drawStars(): void {
    const { ctx, projection } = this;
    const stars = this.catalog.stars;
    const { n: hn, w: hw, u: hu } = this.horizontal;
    const limitMag = limitMagnitudeForFov(projection.fov, this.input.magLimit);
    const washout = this.tint.washout;
    /* W dzień gwiazdy znikają, ale najjaśniejsze zostawiamy, bo Wenus i Syriusz
     * bywają widoczne także przy jasnym niebie. */
    const dayCut = washout > 0.5 ? 2.5 - (washout - 0.5) * 6 : 99;
    const gain = 1;
    const showGround = this.input.layers.horizon;

    /* Rysowanie grupujemy po kubełkach barwy, żeby ograniczyć zmiany stanu kontekstu.
     * Słabe gwiazdy trafiają do jednej ścieżki na kubełek, jasne dostają poświatę. */
    const paths: Path2D[] = Array.from({ length: BUCKET_COUNT + 1 }, () => new Path2D());
    const bright: { x: number; y: number; r: number; bucket: number; index: number }[] = [];

    for (let i = 0; i < stars.count; i++) {
      const mag = stars.mag[i];
      if (mag > limitMag || mag > dayCut) continue;
      const u = hu[i];
      /*
       * Gwiazdy pod horyzontem rysujemy również, bo ziemia jest półprzezroczysta
       * i mają przez nią prześwitywać. Obowiązuje tam jednak ostrzejszy próg
       * jasności: przez zasłonę i tak widać tylko to, co najjaśniejsze, a rysowanie
       * ośmiu tysięcy gwiazd, z których żadnej nie da się dostrzec, byłoby czystym
       * kosztem. Przy wyłączonej warstwie horyzontu żadnego progu nie ma, bo wtedy
       * mapa pokazuje pełną sferę do planowania obserwacji z wyprzedzeniem.
       */
      if (u < -0.01 && showGround && mag > limitMag - 0.8) continue;
      if (!projection.project(hn[i], hw[i], u, this.point)) continue;
      const x = this.point.x;
      const y = this.point.y;
      if (x < -12 || y < -12 || x > this.width + 12 || y > this.height + 12) continue;

      let r = starRadius(mag, limitMag, gain) * this.dpr;
      /* Ekstynkcja atmosferyczna tuż nad horyzontem. */
      if (u < 0.18) r *= 0.45 + (Math.max(0, u) / 0.18) * 0.55;
      if (r < 0.35) continue;

      const bucket = colorBucket(stars.colorIndex[i]);
      if (r >= 3.2 * this.dpr) {
        bright.push({ x, y, r, bucket, index: i });
      } else {
        const path = paths[bucket];
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
      }

      if (r > 2.2 * this.dpr) {
        const hip = stars.hip[i];
        const named = hip ? this.catalog.namedByHip.get(hip) : undefined;
        this.targets.push({
          ref: { kind: 'star', hip, index: i },
          x,
          y,
          radius: Math.max(r, 8 * this.dpr),
          label: named?.name ?? `HIP ${hip}`,
          priority: 1,
        });
      }
    }

    ctx.save();
    const alpha = Math.max(0, 1 - washout * 0.9);
    ctx.globalAlpha = alpha;
    for (let b = 0; b <= BUCKET_COUNT; b++) {
      ctx.fillStyle = BUCKET_CSS[b];
      ctx.fill(paths[b]);
    }

    /* Poświaty jasnych gwiazd rysujemy w trybie rozjaśniania, żeby nakładające się
     * halo dawały efekt zbliżony do rzeczywistego rozproszenia światła w oku. */
    ctx.globalCompositeOperation = 'lighter';
    for (const s of bright) {
      const { sprite, size } = this.glow.get(s.bucket, s.r * 2.6);
      const d = s.r * 5.2;
      ctx.globalAlpha = alpha * Math.min(1, (s.r / size) * 2.2 + 0.35);
      ctx.drawImage(sprite, s.x - d / 2, s.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    for (const s of bright) {
      ctx.fillStyle = BUCKET_CSS[s.bucket];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawStarLabels(): void {
    const { ctx, projection } = this;
    const fade = 1 - this.tint.washout;
    if (fade <= 0.12) return;
    /* Próg jasności podpisów zależy od przybliżenia: im ciaśniejszy kadr,
     * tym więcej nazw ma sens. */
    const t = Math.max(0, Math.min(1, (projection.fov - 8) / 120));
    const magCut = 4.6 - t * 2.4;

    ctx.save();
    ctx.font = `${Math.round(11 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgb(226 232 246 / ${0.78 * fade})`;

    const named = [...this.catalog.named].sort((a, b) => a.mag - b.mag);
    for (const star of named) {
      if (star.mag > magCut) break;
      const label = star.name ?? (star.bayerPl && star.conPl ? `${star.bayerPl} ${star.conPl}` : null);
      if (!label) continue;
      const v = pointToHorizon(star.ra, star.dec, this.rotation);
      if (v.u < 0.02) continue;
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < 0 || y < 0 || x > this.width || y > this.height) continue;
      const width = ctx.measureText(label).width;
      const lx = x + 9 * this.dpr;
      if (!this.claimLabel(lx, y, width)) continue;
      ctx.fillText(label, lx, y);
    }
    ctx.restore();
  }

  private drawBodies(): void {
    const { projection } = this;
    this.planetDiscs.ensureAtlas();
    const ppd = projection.pixelsPerDegree();

    /*
     * Rozmiar rysowanej tarczy.
     *
     * W rzeczywistej skali Jowisz ma czterdzieści pięć sekund łuku, czyli przy
     * typowym kadrze mniej niż jedną dziesiątą piksela. Rysowany wiernie byłby
     * niewidoczny, dlatego, tak jak w każdym planetarium, powiększamy tarcze
     * ponad skalę, ale rosną one wraz z przybliżeniem, więc przy dużym zbliżeniu
     * proporcje między planetami zaczynają odpowiadać rzeczywistym.
     */
    const zoomGain = Math.pow(110 / Math.max(4, projection.fov), 0.55);

    for (const body of this.bodies) {
      if (body.u < -0.02) continue;
      if (!projection.project(body.n, body.w, body.u, this.point)) continue;
      const x = this.point.x;
      const y = this.point.y;
      if (x < -80 || y < -80 || x > this.width + 80 || y > this.height + 80) continue;

      const profile = BODY_PROFILES[body.key];
      const trueRadius = (body.angularSizeDeg / 2) * ppd;
      const base = BASE_DISC_RADIUS[body.key] ?? 3;
      const radius = Math.max(trueRadius, base * zoomGain) * this.dpr;

      if (body.key === 'sun') this.drawSun(x, y, Math.max(radius, 5 * this.dpr));
      else this.drawDisc(body, x, y, radius);

      this.targets.push({
        ref: { kind: 'body', key: body.key },
        x,
        y,
        radius: Math.max(radius, 16 * this.dpr),
        label: profile.name,
        priority: 0,
      });
    }
  }

  /* Płótno pomocnicze do składania fazy. Powstaje raz i rośnie tylko w razie potrzeby. */
  private scratch(size: number): CanvasRenderingContext2D | null {
    if (!this.discScratch) {
      this.discScratch = document.createElement('canvas');
      this.discScratchCtx = this.discScratch.getContext('2d');
    }
    if (!this.discScratch || !this.discScratchCtx) return null;
    if (this.discScratch.width < size) {
      this.discScratch.width = size;
      this.discScratch.height = size;
    }
    this.discScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    /* Czyścimy wyłącznie potrzebny fragment. Przy dziewięciu ciałach na klatkę
     * zerowanie całego płótna kosztowałoby setki tysięcy pikseli. */
    this.discScratchCtx.clearRect(0, 0, size, size);
    return this.discScratchCtx;
  }

  /*
   * Tarcza ciała wraz z fazą.
   *
   * Nieoświetloną część wycinamy trybem usuwania na płótnie pomocniczym, dzięki czemu
   * w miejscu cienia widać niebo, a nie zamalowaną plamę. Przy Księżycu zostawiamy
   * ślad światła popielatego, czyli blasku Ziemi odbitego od jego nocnej strony.
   */
  private drawDisc(body: BodyDraw, x: number, y: number, radius: number): void {
    const { ctx } = this;
    const profile = BODY_PROFILES[body.key];
    const disc = this.planetDiscs.get(body.key, radius);
    const angle = this.limbScreenAngle(body, x, y);
    const lit = Math.max(0, Math.min(1, body.phaseFraction));

    /* Poświata wokół jasnych ciał, zanim położymy tarczę. */
    if (radius > 1.5) {
      const halo = body.key === 'moon' ? radius * 4 : radius * 5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, radius * 0.8, x, y, halo);
      const glowAlpha = body.key === 'moon' ? 0.3 : body.magnitude < 0 ? 0.34 : 0.2;
      g.addColorStop(0, `${profile.color}${Math.round(glowAlpha * 255).toString(16).padStart(2, '0')}`);
      g.addColorStop(1, `${profile.color}00`);
      ctx.fillStyle = g;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
      ctx.restore();
    }

    /* Pierścienie Saturna: tylna połowa pod tarczą, przednia na niej. */
    const rings =
      body.key === 'saturn' && radius > 3 ? saturnRings(radius, body.ringTilt) : null;
    if (rings) drawSaturnRings(ctx, x, y, rings, angle + Math.PI / 2, 'back');

    if (!disc) {
      /* Atlas jeszcze się nie wczytał: rysujemy krążek w barwie ciała. */
      ctx.fillStyle = profile.color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const size = Math.ceil(radius * 2) + 2;
      const scratch = this.scratch(size);
      if (!scratch) return;
      const c = size / 2;
      scratch.drawImage(disc, c - radius, c - radius, radius * 2, radius * 2);

      if (lit < 0.995) {
        /* Kształt oświetlonej części: półokrąg domknięty elipsą terminatora.
         * Przy fazie poniżej połowy elipsa wcina się w tarczę, powyżej ją dopełnia. */
        scratch.save();
        scratch.translate(c, c);
        scratch.rotate(angle);
        scratch.globalCompositeOperation = 'destination-out';
        scratch.beginPath();
        scratch.arc(0, 0, radius + 1, 0, Math.PI * 2);
        scratch.moveTo(0, -radius);
        scratch.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
        scratch.ellipse(0, 0, radius * Math.abs(2 * lit - 1), radius, 0, Math.PI / 2, -Math.PI / 2, lit < 0.5);
        scratch.fill('evenodd');
        scratch.restore();
      }

      ctx.drawImage(this.discScratch as HTMLCanvasElement, 0, 0, size, size, x - c, y - c, size, size);

      /* Światło popielate: nocna strona Księżyca rozjaśniona blaskiem Ziemi. */
      if (body.key === 'moon' && lit < 0.45 && radius > 4) {
        ctx.save();
        ctx.globalAlpha = 0.09 * (1 - lit / 0.45);
        ctx.drawImage(disc, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
      }
    }

    if (rings) drawSaturnRings(ctx, x, y, rings, angle + Math.PI / 2, 'front');

    /* Księżyce galileuszowe Jowisza pojawiają się dopiero przy wyraźnym przybliżeniu. */
    if (body.key === 'jupiter' && this.projection.fov < 26) {
      this.drawJupiterMoons(x, y, radius);
    }

    this.drawBodyLabel(profile.name, x, y, radius, `${profile.color}dd`);
  }

  /*
   * Cztery największe księżyce Jowisza.
   *
   * Silnik zwraca ich położenia względem planety w jednostkach astronomicznych,
   * w układzie związanym z Jowiszem. Przeliczamy je na promienie planety i skalujemy
   * tak samo jak tarczę, dzięki czemu układ zgadza się z tym, co widać w lornetce.
   */
  private drawJupiterMoons(x: number, y: number, radius: number): void {
    const { ctx } = this;

    ctx.save();
    ctx.font = `${Math.round(9 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.jupiterMoons.length; i++) {
      const s = this.jupiterMoons[i];
      /* Oś x układu Jowisza leży w płaszczyźnie orbit księżyców, oś y prostopadle. */
      const mx = x + s.x * radius;
      const my = y - s.y * radius;
      const dotRadius = Math.max(1.1, radius * 0.11) * this.dpr;
      ctx.fillStyle = 'rgb(238 236 226 / 0.92)';
      ctx.beginPath();
      ctx.arc(mx, my, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      if (this.projection.fov < 9) {
        const width = ctx.measureText(s.name).width;
        if (this.claimLabel(mx + dotRadius + 3 * this.dpr, my, width)) {
          ctx.fillStyle = 'rgb(226 232 246 / 0.6)';
          ctx.fillText(s.name, mx + dotRadius + 3 * this.dpr, my);
        }
      }
    }
    ctx.restore();
  }

  private drawSun(x: number, y: number, radius: number): void {
    const { ctx } = this;
    ctx.save();
    const halo = radius * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
    g.addColorStop(0, 'rgb(255 240 200 / 0.9)');
    g.addColorStop(0.14, 'rgb(255 214 140 / 0.42)');
    g.addColorStop(0.45, 'rgb(255 196 120 / 0.12)');
    g.addColorStop(1, 'rgb(255 196 120 / 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
    ctx.fillStyle = 'rgb(255 246 224)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.drawBodyLabel('Słońce', x, y, radius, 'rgb(255 226 170 / 0.9)');
  }

  /*
   * Kąt, o jaki trzeba obrócić rysunek fazy, żeby jasny rąbek trafił we właściwą stronę.
   *
   * Kąt pozycyjny jasnego brzegu jest liczony na sferze niebieskiej, względem północy.
   * Na ekranie kierunek północy zależy od projekcji i od tego, gdzie patrzymy, więc
   * wyznaczamy go doświadczalnie: rzutujemy punkt przesunięty na północ i na wschód,
   * a potem składamy oba kierunki zgodnie z kątem pozycyjnym.
   */
  private limbScreenAngle(body: BodyDraw, x: number, y: number): number {
    const altAz = vectorToAltAz(body.n, body.w, body.u);
    const north = altAzToVector(altAz.azimuth, Math.min(89.5, altAz.altitude + 0.4));
    const east = altAzToVector(
      altAz.azimuth + 0.4 / Math.max(0.2, Math.cos(altAz.altitude * D2R)),
      altAz.altitude,
    );

    let nx = 0;
    let ny = -1;
    if (this.projection.project(north.n, north.w, north.u, this.point2)) {
      nx = this.point2.x - x;
      ny = this.point2.y - y;
    }
    let ex = 1;
    let ey = 0;
    if (this.projection.project(east.n, east.w, east.u, this.point2)) {
      ex = this.point2.x - x;
      ey = this.point2.y - y;
    }
    const nl = Math.hypot(nx, ny) || 1;
    const el = Math.hypot(ex, ey) || 1;
    const chi = body.brightLimbAngle * D2R;
    const dx = (nx / nl) * Math.cos(chi) + (ex / el) * Math.sin(chi);
    const dy = (ny / nl) * Math.cos(chi) + (ey / el) * Math.sin(chi);
    return Math.atan2(dy, dx);
  }

  private drawBodyLabel(text: string, x: number, y: number, r: number, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = `500 ${Math.round(11 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width;
    const lx = x + r + 8 * this.dpr;
    if (this.claimLabel(lx, y, width)) {
      ctx.fillStyle = color;
      ctx.fillText(text, lx, y);
    }
    ctx.restore();
  }

  /*
   * Grunt i linia horyzontu.
   *
   * Wypełnienie jest nieprzezroczyste, bo przesłania wszystko, co silnik narysował
   * poniżej horyzontu. Tuż nad krawędzią kładziemy wąski gradient odwzorowujący
   * łunę świateł miasta: jej siła zależy od stopnia zanieczyszczenia nieba światłem
   * w skali Bortle'a, więc z Bieszczadów jest ledwie widoczna, a z Warszawy wyraźna.
   */
  /*
   * Położenia satelitów.
   *
   * Osobny krok od reszty efemeryd, bo satelita na niskiej orbicie przemierza pół stopnia
   * na sekundę, czyli sto razy szybciej niż cokolwiek innego na tej mapie. Krok jednej
   * sekundy czasu symulacji daje przy typowym polu widzenia przesunięcie kilku pikseli,
   * a pełne przeliczenie stu siedemdziesięciu obiektów trwa około czterech milisekund,
   * więc rozłożone na sekundę pracy pętli kosztuje ułamek klatki.
   */
  private updateSatellites(): void {
    const { date, location, satellites } = this.input;
    if (satellites.length === 0) {
      this.satelliteFixes = [];
      return;
    }
    /* Ten sam mechanizm co przy gwiazdach, ale z twardym dnem: przeliczenie stu
     * siedemdziesięciu satelitów kosztuje około czterech milisekund, więc nie może
     * wypadać częściej niż mniej więcej co szóstą klatkę. */
    const quantum = Math.max(100, 1000 / Math.max(1, Math.abs(this.input.timeScale)));
    const key = `${Math.round(date.getTime() / quantum)}:${satellites.length}:${location.lat.toFixed(3)}`;
    if (key === this.satelliteKey) return;
    this.satelliteKey = key;
    this.satelliteFixes = fixesAbove(
      satellites,
      date,
      { lat: location.lat, lon: location.lon, elevation: location.elevation },
      /* Kilka stopni pod horyzontem zostawiamy, żeby satelita nie wyskakiwał znikąd
       * przy patrzeniu tuż nad krawędź terenu. */
      -3,
    );
  }

  /*
   * Rysunek satelitów.
   *
   * Obiekt w cieniu Ziemi nie świeci, choć jest nad horyzontem. Pokazujemy go pustym
   * kółkiem zamiast go pomijać, bo to informacja: satelita jest na miejscu, tylko
   * jeszcze nie wszedł w światło. Obiekt oświetlony dostaje wypełnienie i podpis.
   */
  private drawSatellites(): void {
    const { ctx, projection } = this;
    if (this.satelliteFixes.length === 0) return;

    const fade = 1 - this.tint.washout;
    if (fade < 0.05) return;

    ctx.save();
    ctx.lineWidth = this.dpr;
    for (const fix of this.satelliteFixes) {
      const v = altAzToVector(fix.azimuth, fix.altitude);
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < -40 || y < -40 || x > this.width + 40 || y > this.height + 40) continue;

      /* Wielkość znacznika idzie za jasnością, tak jak u gwiazd, ale w węższym zakresie,
       * bo satelita jest punktem bez tarczy i nie ma powodu, żeby dominował nad niebem. */
      const mag = fix.magnitude ?? 4;
      const radius = Math.max(1.6, Math.min(4.2, 3.6 - mag * 0.42)) * this.dpr;
      const alpha = fade * (fix.sunlit ? 0.95 : 0.34);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (fix.sunlit) {
        ctx.fillStyle = `rgb(214 232 255 / ${alpha})`;
        ctx.fill();
        /* Delikatny halo, żeby odróżnić satelitę od gwiazdy o podobnej jasności. */
        ctx.strokeStyle = `rgb(150 200 255 / ${alpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2.6 * this.dpr, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgb(150 172 214 / ${alpha})`;
        ctx.stroke();
      }

      this.targets.push({
        ref: { kind: 'satellite', id: fix.id },
        x,
        y,
        radius: Math.max(radius, 10 * this.dpr),
        label: fix.label ?? fix.name,
        priority: 2,
      });

      /* Podpisujemy tylko to, co jasne i oświetlone, żeby nie zasypać nieba nazwami
       * członów rakiet. Próg jest ten sam, od którego obiekt jest realnie widoczny gołym okiem. */
      if (fix.sunlit && fix.magnitude !== null && fix.magnitude < 3 && fix.altitude > 5) {
        this.drawBodyLabel(
          fix.label ?? fix.name,
          x,
          y,
          radius,
          `rgb(196 216 248 / ${(alpha * 0.85).toFixed(2)})`,
        );
      }
    }
    ctx.restore();
  }

  private drawGround(horizon: HorizonGeometry): void {
    const { ctx, projection } = this;

    /* Łuna nad horyzontem, rysowana przed gruntem, żeby grunt ją przyciął. */
    const bortle = this.input.location.bortle ?? 6;
    const glow = Math.max(0, (bortle - 2) / 7) * (1 - this.tint.washout);
    if (this.input.layers.atmosphere && glow > 0.02) {
      const height = Math.min(this.height, projection.scale * 0.34);
      ctx.save();
      if (horizon.kind === 'circle') {
        const inner = Math.max(0, horizon.radius - (horizon.groundOutside ? height : 0));
        const outer = horizon.radius + (horizon.groundOutside ? 0 : height);
        if (Number.isFinite(outer) && outer > 0 && outer < 40000) {
          const g = ctx.createRadialGradient(horizon.x, horizon.y, inner, horizon.x, horizon.y, outer);
          const stops: [number, number][] = horizon.groundOutside
            ? [
                [0, 0],
                [1, 0.5 * glow],
              ]
            : [
                [0, 0.5 * glow],
                [1, 0],
              ];
          for (const [offset, alpha] of stops) {
            g.addColorStop(offset, rgb(this.tint.horizon, alpha));
          }
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, this.width, this.height);
        }
      } else {
        const from = horizon.groundBelow ? horizon.y - height : horizon.y;
        const g = ctx.createLinearGradient(0, from, 0, from + height);
        g.addColorStop(horizon.groundBelow ? 0 : 1, rgb(this.tint.horizon, 0));
        g.addColorStop(horizon.groundBelow ? 1 : 0, rgb(this.tint.horizon, 0.5 * glow));
        ctx.fillStyle = g;
        ctx.fillRect(0, from, this.width, height);
      }
      ctx.restore();
    }

    if (this.terrainVisible()) {
      this.drawTerrain(horizon);
    } else {
      /*
       * Przy bardzo wąskim polu widzenia planów nie rysujemy, więc grunt musi
       * mieć wypełnienie własne. Jest kryjące, bo bez planów nie ma czym stopniować
       * przezroczystości, a półprzezroczysta płachta wyglądałaby jak usterka.
       */
      const { path, rule } = this.groundPath(horizon);
      ctx.save();
      ctx.fillStyle = this.groundFill(horizon);
      ctx.fill(path, rule);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgb(132 154 200 / 0.5)';
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath();
      if (horizon.kind === 'circle') {
        if (horizon.radius < 40000) ctx.arc(horizon.x, horizon.y, horizon.radius, 0, Math.PI * 2);
      } else {
        ctx.moveTo(0, horizon.y);
        ctx.lineTo(this.width, horizon.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    this.drawCardinalPoints(horizon);
  }

  /*
   * Wypełnienie gruntu z gradientem w głąb.
   *
   * Gradient biegnie prostopadle do krawędzi horyzontu: przy samej krawędzi barwa jest
   * rozjaśniona mgiełką dalekiego planu, dalej schodzi do ciemniejszej barwy terenu
   * pod nogami. Przy horyzoncie w postaci okręgu jest to gradient promienisty,
   * przy prostej linii pionowy.
   */
  private groundFill(horizon: HorizonGeometry): string | CanvasGradient {
    const { ctx } = this;
    const base = this.tint.ground;
    /*
     * Mgiełka dalekiego planu. Przy czarnym gruncie musi być delikatna: chodzi o to,
     * żeby krawędź nie wyglądała na wyciętą nożyczkami, a nie o rozjaśnianie terenu.
     */
    const haze: [number, number, number] = [
      Math.round(base[0] + (this.tint.horizon[0] - base[0]) * 0.12),
      Math.round(base[1] + (this.tint.horizon[1] - base[1]) * 0.12),
      Math.round(base[2] + (this.tint.horizon[2] - base[2]) * 0.12),
    ];
    const deep: [number, number, number] = [
      Math.max(0, Math.round(base[0] * 0.4)),
      Math.max(0, Math.round(base[1] * 0.4)),
      Math.max(0, Math.round(base[2] * 0.45)),
    ];
    const depth = Math.max(40, this.projection.scale * 0.5);

    if (horizon.kind === 'circle') {
      if (!Number.isFinite(horizon.radius) || horizon.radius > 40000) return rgb(base);
      const inner = horizon.groundOutside ? horizon.radius : Math.max(0, horizon.radius - depth);
      const outer = horizon.groundOutside ? horizon.radius + depth : horizon.radius;
      if (!(outer > inner)) return rgb(base);
      const g = ctx.createRadialGradient(horizon.x, horizon.y, inner, horizon.x, horizon.y, outer);
      g.addColorStop(0, rgb(horizon.groundOutside ? haze : deep));
      g.addColorStop(1, rgb(horizon.groundOutside ? deep : haze));
      return g;
    }

    const from = horizon.y;
    const to = horizon.groundBelow ? horizon.y + depth : horizon.y - depth;
    const g = ctx.createLinearGradient(0, from, 0, to);
    g.addColorStop(0, rgb(haze));
    g.addColorStop(1, rgb(deep));
    return g;
  }

  /*
   * Barwa jednego planu terenu.
   *
   * Plan daleki jest jaśniejszy i bardziej niebieski od bliskiego, mimo że oba
   * przedstawiają ten sam ciemny teren. Powód jest fizyczny: między obserwatorem
   * a dalekim grzbietem leży grubsza warstwa powietrza, która rozprasza światło
   * nieba w stronę oka i tym samym rozjaśnia oraz odbarwia to, co za nią.
   *
   * Dlatego barwę liczymy jako mieszankę własnej barwy terenu z barwą nieba przy
   * horyzoncie, w proporcji zależnej wyłącznie od odległości planu. Ta jedna formuła
   * działa o każdej porze doby bez żadnych przypadków szczególnych: w dzień barwa
   * nieba przy horyzoncie jest jasna, więc dalekie plany robią się wyraźnie jaśniejsze,
   * a w nocy jest ciemna, więc wszystkie plany schodzą do czerni i teren przestaje
   * przeszkadzać w obserwacji, tak jak w rzeczywistości.
   */
  private ridgeFill(ridge: Ridge): string {
    const g = this.tint.ground;
    const h = this.tint.horizon;
    /*
     * Od 0,82 dla planu najdalszego do 0,14 dla ziemi pod nogami. Rozpiętość jest
     * duża celowo: to ona niesie całą informację o głębi, bo kształt profili sam
     * z siebie nie mówi oku, co jest bliżej.
     */
    const mix = 0.82 - 0.68 * ridge.distance;
    /*
     * Odchylenie ku błękitowi. Teren nie świeci własnym światłem, tylko odbija to,
     * które spada na niego z nieba, a niebo jest niebieskie. Roślinność i gleba
     * pochłaniają przy tym czerwień mocniej niż błękit, więc daleki las widziany
     * przez powietrze jest wyraźnie chłodniejszy niż z bliska. Bez tej poprawki
     * plany wychodziły szare i wyglądały jak druk w odcieniach popiołu.
     */
    return rgb([
      Math.round((g[0] + (h[0] - g[0]) * mix) * 0.9),
      Math.round((g[1] + (h[1] - g[1]) * mix) * 0.96),
      Math.round(g[2] + (h[2] - g[2]) * mix),
    ]);
  }

  /*
   * Plany terenu wzdłuż horyzontu.
   *
   * Każdy plan to wielokąt: górną krawędź dają próbki profilu rzutowane na ekran,
   * a dolną te same punkty przesunięte w stronę gruntu o odległość większą niż
   * przekątna ekranu. Przesunięcie liczymy w pikselach, a nie we współrzędnych nieba,
   * i to jest tu rzecz kluczowa. Punkt o wysokości minus dziewięćdziesiąt stopni,
   * czyli nadir, nie daje się zrzutować przy patrzeniu w górę, więc każda próba
   * domknięcia wielokąta "od dołu" przez współrzędne nieba rozpadałaby się na kawałki
   * dokładnie tam, gdzie teren ma być najbardziej zwarty. Przesunięcie ekranowe
   * jest zawsze dobrze określone.
   *
   * Kierunek "w stronę gruntu" zależy od geometrii horyzontu: przy horyzoncie w postaci
   * okręgu jest promienisty, przy prostej linii pionowy.
   *
   * Plany rysujemy od najdalszego do najbliższego, więc bliższy zasłania dalszy
   * bez żadnego liczenia widoczności: wystarczy kolejność malowania.
   */
  /*
   * Czy plany terenu w ogóle są rysowane.
   *
   * Przy bardzo wąskim polu widzenia profil urósłby do rozmiaru gór i kłamałby
   * o tym, co zasłania obiekt. Przy skrajnym oddaleniu cały profil zmieściłby się
   * w jednym pikselu i nie byłoby czego rysować.
   */
  private terrainVisible(): boolean {
    return this.projection.fov >= 8 && TERRAIN_MAX * this.projection.pixelsPerDegree() >= 0.7;
  }

  /*
   * Jak głęboko pod horyzontem grunt przestaje być kryjący, w stopniach.
   * Szesnaście stopni to około połowy tego, co mieści się pod horyzontem w kadrze,
   * więc tuż pod linią nieba ziemia jest jeszcze szczelna i daje ostrą sylwetkę,
   * a niżej szybko robi się zasłoną, przez którą widać niebo.
   */
  private static readonly FADE_DEPTH_DEG = 16;

  /*
   * Ile ziemi zostaje w najgłębszym punkcie kadru, czyli jak mocno prześwituje
   * przez nią niebo. Wartość dobrana pomiarowo z aplikacji, która robi to samo:
   * przy 0,24 ziemia była praktycznie szczelna i gwiazd pod horyzontem nie było
   * widać wcale, przy 0,5 zasłona jest wyraźna, ale figury i Droga Mleczna
   * pozostają czytelne, o co w tym zabiegu chodzi.
   */
  private static readonly FADE_MIN_ALPHA = 0.5;

  private drawTerrain(horizon: HorizonGeometry): void {
    const { projection } = this;
    const buffer = this.terrainCtx;
    const bufferCanvas = this.terrainCanvas;
    if (!buffer || !bufferCanvas) return;

    buffer.setTransform(1, 0, 0, 1, 0, 0);
    buffer.clearRect(0, 0, this.width, this.height);

    const limit = Math.max(this.width, this.height) * 4;
    const reach = Math.hypot(this.width, this.height) * 1.6;

    /* Gęstość próbkowania idzie za skalą: przy szerokim polu widzenia stopień
     * to kilka pikseli, więc drobniejsze próbkowanie niczego by nie dodało. */
    const step = projection.pixelsPerDegree() > 24 ? 0.5 : 1;

    buffer.lineJoin = 'round';

    for (const ridge of RIDGES) {
      buffer.fillStyle = this.ridgeFill(ridge);
      let run: { x: number; y: number }[] = [];

      const flush = () => {
        if (run.length > 1) {
          buffer.beginPath();
          buffer.moveTo(run[0].x, run[0].y);
          for (let i = 1; i < run.length; i++) buffer.lineTo(run[i].x, run[i].y);
          for (let i = run.length - 1; i >= 0; i--) {
            const { x, y } = run[i];
            const d = this.groundDirection(horizon, x, y);
            buffer.lineTo(x + d.x * reach, y + d.y * reach);
          }
          buffer.closePath();
          buffer.fill();
        }
        run = [];
      };

      for (let az = 0; az <= 360; az += step) {
        const v = altAzToVector(az, ridgeAltitude(ridge, az));
        const ok = projection.project(v.n, v.w, v.u, this.point);
        if (ok && Math.abs(this.point.x) < limit && Math.abs(this.point.y) < limit) {
          run.push({ x: this.point.x, y: this.point.y });
        } else {
          flush();
        }
      }
      flush();
    }

    /*
     * Maska zanikania.
     *
     * Tryb destination-in zostawia z bufora tylko to, co pokrywa się z rysowanym
     * kształtem, i to w jego przezroczystości. Rysujemy więc gradient biegnący
     * prostopadle do horyzontu: pełne krycie na linii nieba, coraz mniejsze w głąb.
     *
     * Efekt jest taki, że tuż pod horyzontem ziemia jest szczelna i daje ostrą
     * sylwetkę na tle jasnego nieba, a im głębiej pod nogi, tym mocniej prześwituje
     * przez nią niebo z gwiazdami. Bez tego mapa nieba kończyłaby się na horyzoncie
     * i traciła połowę treści.
     */
    buffer.globalCompositeOperation = 'destination-in';
    buffer.fillStyle = this.fadeMask(buffer, horizon);
    buffer.fillRect(0, 0, this.width, this.height);
    buffer.globalCompositeOperation = 'source-over';

    this.ctx.drawImage(bufferCanvas, 0, 0);
  }

  /* Gradient przezroczystości gruntu, biegnący prostopadle do krawędzi horyzontu. */
  private fadeMask(
    target: CanvasRenderingContext2D,
    horizon: HorizonGeometry,
  ): CanvasGradient | string {
    const depth = Math.max(
      40,
      SkyRenderer.FADE_DEPTH_DEG * this.projection.pixelsPerDegree(),
    );
    const pelne = 'rgb(0 0 0 / 1)';
    const slabe = `rgb(0 0 0 / ${SkyRenderer.FADE_MIN_ALPHA})`;

    if (horizon.kind === 'line') {
      const from = horizon.y;
      const to = horizon.groundBelow ? horizon.y + depth : horizon.y - depth;
      const g = target.createLinearGradient(0, from, 0, to);
      g.addColorStop(0, pelne);
      g.addColorStop(1, slabe);
      return g;
    }

    if (!Number.isFinite(horizon.radius) || horizon.radius > 40000) return pelne;

    const inner = horizon.groundOutside ? horizon.radius : Math.max(0, horizon.radius - depth);
    const outer = horizon.groundOutside ? horizon.radius + depth : horizon.radius;
    if (!(outer > inner)) return pelne;

    const g = target.createRadialGradient(horizon.x, horizon.y, inner, horizon.x, horizon.y, outer);
    g.addColorStop(0, horizon.groundOutside ? pelne : slabe);
    g.addColorStop(1, horizon.groundOutside ? slabe : pelne);
    return g;
  }

  /*
   * Jednostkowy wektor wskazujący od punktu na ekranie w stronę gruntu.
   * Przy horyzoncie kołowym prowadzi wzdłuż promienia, przy prostym pionowo.
   */
  private groundDirection(
    horizon: HorizonGeometry,
    x: number,
    y: number,
  ): { x: number; y: number } {
    if (horizon.kind === 'line') {
      return { x: 0, y: horizon.groundBelow ? 1 : -1 };
    }
    const dx = x - horizon.x;
    const dy = y - horizon.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: 0, y: 1 };
    const sign = horizon.groundOutside ? 1 : -1;
    return { x: (dx / len) * sign, y: (dy / len) * sign };
  }

  /* Kierunki świata, podpisane skrótami międzynarodowymi. */
  private drawCardinalPoints(horizon: HorizonGeometry): void {
    const { ctx, projection } = this;
    /* Skróty N, E, S, W są w astronomii i nawigacji standardem także w polskich
     * publikacjach, a ich przewaga jest praktyczna: nie mylą się z niczym innym
     * i zgadzają się z opisami azymutu w pozostałych częściach aplikacji. */
    const marks: [number, string][] = [
      [0, 'N'],
      [45, 'NE'],
      [90, 'E'],
      [135, 'SE'],
      [180, 'S'],
      [225, 'SW'],
      [270, 'W'],
      [315, 'NW'],
    ];
    ctx.save();
    ctx.font = `600 ${Math.round(11 * this.dpr)}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    /*
     * Podpisy stawiamy na widocznej krawędzi terenu, a nie na wysokości zero.
     * Obserwator nie widzi matematycznego horyzontu, tylko linię, na której niebo
     * styka się z ziemią, i to na niej spodziewa się znaleźć kierunek świata.
     */
    const skyline = this.terrainVisible() ? terrainAltitude : () => 0;
    for (const [az, label] of marks) {
      const v = altAzToVector(az, skyline(az));
      if (!projection.project(v.n, v.w, v.u, this.point)) continue;
      const { x, y } = this.point;
      if (x < 0 || y < 0 || x > this.width || y > this.height) continue;

      /* Podpis odsuwamy w stronę gruntu, prostopadle do krawędzi horyzontu. */
      let dx = 0;
      let dy = 1;
      if (horizon.kind === 'circle') {
        const len = Math.hypot(x - horizon.x, y - horizon.y) || 1;
        const sign = horizon.groundOutside ? 1 : -1;
        dx = (sign * (x - horizon.x)) / len;
        dy = (sign * (y - horizon.y)) / len;
      } else {
        dy = horizon.groundBelow ? 1 : -1;
      }
      const offset = 15 * this.dpr;
      const cardinal = az % 90 === 0;
      ctx.fillStyle = cardinal ? 'rgb(226 232 246 / 0.78)' : 'rgb(160 178 214 / 0.46)';
      ctx.letterSpacing = '0.1em';
      ctx.fillText(label, x + dx * offset, y + dy * offset);
      ctx.letterSpacing = '0px';
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  private drawSelection(): void {
    const selected = this.input.selected;
    if (!selected) return;
    const target = this.targets.find((t) => refEquals(t.ref, selected));
    if (!target) return;
    const { ctx } = this;
    const r = Math.max(target.radius, 13 * this.dpr);
    ctx.save();
    ctx.strokeStyle = 'rgb(233 178 90 / 0.9)';
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.stroke();

    /* Cztery krótkie kreski zamiast pełnego krzyża, żeby nie zasłaniać obiektu. */
    const tick = 5 * this.dpr;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(target.x + dx * (r + 3 * this.dpr), target.y + dy * (r + 3 * this.dpr));
      ctx.lineTo(target.x + dx * (r + 3 * this.dpr + tick), target.y + dy * (r + 3 * this.dpr + tick));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Znajduje obiekt pod wskazanym punktem. Współrzędne podawane w pikselach CSS. */
  hitTest(cssX: number, cssY: number, toleranceCss = 18): SkyObjectRef | null {
    const x = cssX * this.dpr;
    const y = cssY * this.dpr;
    const tol = toleranceCss * this.dpr;
    let best: HitTarget | null = null;
    let bestScore = Infinity;
    for (const t of this.targets) {
      const d = Math.hypot(t.x - x, t.y - y);
      const reach = Math.max(t.radius, tol);
      if (d > reach) continue;
      const score = d + t.priority * 6 * this.dpr;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best ? best.ref : null;
  }

  /** Kierunek patrzenia odpowiadający punktowi ekranu, w stopniach. */
  screenToAltAz(cssX: number, cssY: number): { azimuth: number; altitude: number } {
    const v = this.projection.unproject(cssX * this.dpr, cssY * this.dpr);
    return vectorToAltAz(v.n, v.w, v.u);
  }

  /** Azymut i wysokość obiektu o współrzędnych J2000, dla aktualnego czasu i miejsca. */
  equatorialToAltAz(raHours: number, decDeg: number): { azimuth: number; altitude: number } {
    const v = pointToHorizon(raHours, decDeg, this.rotation);
    return vectorToAltAz(v.n, v.w, v.u);
  }

  /** Pozycja ekranowa obiektu o współrzędnych J2000, w pikselach CSS. */
  equatorialToScreen(raHours: number, decDeg: number): { x: number; y: number } | null {
    const v = pointToHorizon(raHours, decDeg, this.rotation);
    if (!this.projection.project(v.n, v.w, v.u, this.point)) return null;
    return { x: this.point.x / this.dpr, y: this.point.y / this.dpr };
  }

  /** Aktualna pozycja horyzontalna ciała Układu Słonecznego. */
  bodyAltAz(key: BodyKey): { azimuth: number; altitude: number } {
    const body = this.bodies.find((b) => b.key === key);
    if (!body) return { azimuth: 0, altitude: 0 };
    return vectorToAltAz(body.n, body.w, body.u);
  }

  destroy(): void {
    this.glow.clear();
    this.planetDiscs.clear();
    this.targets.length = 0;
  }
}

function refEquals(a: SkyObjectRef, b: SkyObjectRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'star' && b.kind === 'star') return a.hip === b.hip && a.index === b.index;
  if (a.kind === 'body' && b.kind === 'body') return a.key === b.key;
  if (a.kind === 'dso' && b.kind === 'dso') return a.id === b.id;
  if (a.kind === 'constellation' && b.kind === 'constellation') return a.id === b.id;
  if (a.kind === 'asterism' && b.kind === 'asterism') return a.id === b.id;
  return false;
}

/* Poświata zmierzchowa nie powinna świecić spod ziemi, tylko z punktu horyzontu
 * leżącego pod Słońcem. Rzutujemy więc kierunek Słońca na płaszczyznę horyzontu. */
function projectGlowAnchor(sun: { n: number; w: number; u: number }): { n: number; w: number; u: number } {
  const len = Math.hypot(sun.n, sun.w) || 1;
  return { n: sun.n / len, w: sun.w / len, u: 0.04 };
}

