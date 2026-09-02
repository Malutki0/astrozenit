import type { BodyKey } from '@/lib/astro/types';

/*
 * Tarcze planet i Księżyca.
 *
 * Mapy powierzchni pochodzą z serwisu Solar System Scope (licencja CC BY 4.0),
 * opracowane na podstawie zdjęć NASA. Są sklejone w jeden atlas, więc pobieramy
 * i dekodujemy jeden plik zamiast ośmiu.
 *
 * Tarcza powstaje przez odwzorowanie odwrotne: dla każdego piksela koła liczymy
 * punkt na kuli, zamieniamy go na współrzędne w odwzorowaniu walcowym i odczytujemy
 * barwę z mapy. Na koniec dokładamy pociemnienie brzegowe, bo brzeg tarczy widzimy
 * przez grubszą warstwę atmosfery albo pod ostrzejszym kątem.
 *
 * Każda tarcza powstaje raz i jest zapamiętywana, bo obrót planety w skali,
 * w jakiej ją rysujemy, i tak jest niedostrzegalny.
 */

interface AtlasManifest {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  bodies: string[];
}

export interface PlanetAtlas {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  manifest: AtlasManifest;
}

let loading: Promise<PlanetAtlas | null> | null = null;

export function loadPlanetAtlas(base = '/data'): Promise<PlanetAtlas | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const manifest = (await fetch(`${base}/planets.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })) as AtlasManifest;

      const image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `${base}/planets.jpg`;
      });
      if (!image) return null;

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, data: pixels.data, manifest };
    } catch {
      /* Brak atlasu nie może przewrócić mapy. Planety rysują się wtedy
       * jako jednolite krążki w barwie charakterystycznej dla danego ciała. */
      return null;
    }
  })();
  return loading;
}

/** Nachylenie osi obrotu, w stopniach. Widoczne przy Uranie, który leży na boku. */
const AXIAL_TILT: Partial<Record<BodyKey, number>> = {
  mercury: 0.03,
  venus: 177.4,
  mars: 25.2,
  jupiter: 3.1,
  saturn: 26.7,
  uranus: 97.8,
  neptune: 28.3,
  moon: 6.7,
};

export class PlanetDiscCache {
  private atlas: PlanetAtlas | null = null;
  private requested = false;
  private discs = new Map<string, HTMLCanvasElement>();

  /** Rozpoczyna pobieranie atlasu. Do czasu jego wczytania tarcze nie są dostępne. */
  ensureAtlas(base?: string): void {
    if (this.atlas || this.requested) return;
    this.requested = true;
    void loadPlanetAtlas(base).then((atlas) => {
      this.atlas = atlas;
    });
  }

  get ready(): boolean {
    return this.atlas !== null;
  }

  /*
   * Rozmiary tarcz zaokrąglamy do potęg dwójki. Bez tego przy płynnym przybliżaniu
   * powstawałaby nowa tarcza w każdej klatce, a każda kosztuje kilkadziesiąt tysięcy
   * odczytów z mapy. Skalowanie gotowej tarczy przy rysowaniu jest darmowe.
   */
  private static bucket(radius: number): number {
    return Math.max(16, Math.min(256, 1 << Math.ceil(Math.log2(radius * 2))));
  }

  get(key: BodyKey, radius: number): HTMLCanvasElement | null {
    const atlas = this.atlas;
    if (!atlas) return null;
    const index = atlas.manifest.bodies.indexOf(key);
    if (index < 0) return null;

    const size = PlanetDiscCache.bucket(radius);
    const cacheKey = `${key}:${size}`;
    const cached = this.discs.get(cacheKey);
    if (cached) return cached;

    const disc = this.render(atlas, index, key, size);
    this.discs.set(cacheKey, disc);
    return disc;
  }

  private render(atlas: PlanetAtlas, index: number, key: BodyKey, size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const { columns, cellWidth, cellHeight } = atlas.manifest;
    const cellX = (index % columns) * cellWidth;
    const cellY = Math.floor(index / columns) * cellHeight;

    const image = ctx.createImageData(size, size);
    const out = image.data;
    const src = atlas.data;
    const atlasW = atlas.width;

    const r = size / 2;
    const tilt = ((AXIAL_TILT[key] ?? 0) * Math.PI) / 180;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);

    for (let py = 0; py < size; py++) {
      const y = (py + 0.5 - r) / r;
      for (let px = 0; px < size; px++) {
        const x = (px + 0.5 - r) / r;
        const d2 = x * x + y * y;
        const o = (py * size + px) * 4;
        if (d2 >= 1) {
          out[o + 3] = 0;
          continue;
        }
        const z = Math.sqrt(1 - d2);

        /* Obrót o nachylenie osi, żeby bieguny wypadły tam, gdzie powinny. */
        const ry = y * cosTilt - z * sinTilt;
        const rz = y * sinTilt + z * cosTilt;

        const lat = Math.asin(Math.max(-1, Math.min(1, -ry)));
        const lon = Math.atan2(x, rz);

        let tu = 0.5 + lon / (2 * Math.PI);
        tu -= Math.floor(tu);
        const tv = Math.max(0, Math.min(0.999, 0.5 - lat / Math.PI));

        const tx = cellX + Math.min(cellWidth - 1, (tu * cellWidth) | 0);
        const ty = cellY + Math.min(cellHeight - 1, (tv * cellHeight) | 0);
        const t = (ty * atlasW + tx) * 4;

        /* Pociemnienie brzegowe. Wykładnik dobrany tak, żeby tarcza wyglądała
         * na kulistą, ale nie gasła przy krawędzi jak reflektor. */
        const shade = 0.58 + 0.42 * Math.pow(z, 0.55);
        /* Wygładzenie krawędzi na szerokość jednego piksela, zamiast schodków. */
        const edge = Math.min(1, (1 - Math.sqrt(d2)) * r);

        out[o] = src[t] * shade;
        out[o + 1] = src[t + 1] * shade;
        out[o + 2] = src[t + 2] * shade;
        out[o + 3] = 255 * edge;
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  clear(): void {
    this.discs.clear();
  }
}

/*
 * Pierścienie Saturna.
 *
 * Rysujemy je jako pierścień eliptyczny, którego spłaszczenie wynika z kąta,
 * pod jakim widzimy ich płaszczyznę. Promienie odpowiadają rzeczywistym:
 * wewnętrzna krawędź pierścienia C leży na 1,24 promienia planety,
 * zewnętrzna krawędź pierścienia A na 2,27.
 */
export interface RingGeometry {
  inner: number;
  outer: number;
  /** Spłaszczenie elipsy, od 0 przy widoku z profilu do 1 przy widoku z góry. */
  flatten: number;
}

export function saturnRings(planetRadius: number, ringTiltDeg: number): RingGeometry {
  return {
    inner: planetRadius * 1.24,
    outer: planetRadius * 2.27,
    flatten: Math.abs(Math.sin((ringTiltDeg * Math.PI) / 180)),
  };
}

export function drawSaturnRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  geometry: RingGeometry,
  rotation: number,
  half: 'back' | 'front',
): void {
  const { inner, outer, flatten } = geometry;
  /* Przy widoku dokładnie z profilu pierścienie znikają, co zdarza się
   * mniej więcej co piętnaście lat. Rysujemy wtedy cienką kreskę. */
  const minorOuter = Math.max(0.6, outer * flatten);
  const minorInner = Math.max(0.3, inner * flatten);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.beginPath();
  if (half === 'back') ctx.ellipse(0, 0, outer, minorOuter, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, outer, minorOuter, 0, 0, Math.PI);
  if (half === 'back') ctx.ellipse(0, 0, inner, minorInner, 0, Math.PI * 2, Math.PI, true);
  else ctx.ellipse(0, 0, inner, minorInner, 0, Math.PI, 0, true);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(-outer, 0, outer, 0);
  /* Przerwa Cassiniego rozdziela pierścienie A i B na około 88 procentach promienia. */
  gradient.addColorStop(0, 'rgb(196 178 148 / 0.72)');
  gradient.addColorStop(0.44, 'rgb(214 198 168 / 0.86)');
  gradient.addColorStop(0.47, 'rgb(150 138 118 / 0.4)');
  gradient.addColorStop(0.5, 'rgb(206 190 160 / 0.8)');
  gradient.addColorStop(0.53, 'rgb(150 138 118 / 0.4)');
  gradient.addColorStop(0.56, 'rgb(214 198 168 / 0.86)');
  gradient.addColorStop(1, 'rgb(196 178 148 / 0.72)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/*
 * PIERŚCIENIE SATURNA
 *
 * Profil promieniowy, a nie mapa kuli: barwa i przezroczystość pierścieni zależą
 * wyłącznie od odległości od planety. Dane pochodzą z tego samego źródła co mapy
 * powierzchni i są przygotowane skryptem build:textures.
 */
export interface RingProfile {
  /** Promień wewnętrznej krawędzi, w promieniach planety. */
  innerRadius: number;
  /** Promień zewnętrznej krawędzi, w promieniach planety. */
  outerRadius: number;
  samples: number;
  rgba: Uint8ClampedArray;
}

let ringsLoading: Promise<RingProfile | null> | null = null;

export function loadRingProfile(base = '/data'): Promise<RingProfile | null> {
  if (ringsLoading) return ringsLoading;
  ringsLoading = fetch(`${base}/rings.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{
        innerRadius: number;
        outerRadius: number;
        samples: number;
        rgba: number[];
      }>;
    })
    .then((raw) => ({
      innerRadius: raw.innerRadius,
      outerRadius: raw.outerRadius,
      samples: raw.samples,
      rgba: new Uint8ClampedArray(raw.rgba),
    }))
    /* Brak profilu oznacza globus bez pierścieni, a nie błąd całego panelu. */
    .catch(() => null);
  return ringsLoading;
}
