/*
 * Barwy i poświaty gwiazd.
 *
 * Kolor wynika ze wskaźnika barwy B minus V, czyli różnicy jasności w filtrze niebieskim
 * i wizualnym. Zamiast liczyć widmo ciała doskonale czarnego korzystamy z tablicy
 * kontrolnej, bo pozwala świadomie przygasić nasycenie. Niebo pełne jaskrawych punktów
 * wygląda jak zabawka, a nie jak nocne niebo.
 */

type Rgb = [number, number, number];

const COLOR_STOPS: { bv: number; rgb: Rgb }[] = [
  { bv: -0.4, rgb: [158, 180, 255] },
  { bv: -0.2, rgb: [175, 195, 255] },
  { bv: 0.0, rgb: [205, 217, 255] },
  { bv: 0.2, rgb: [228, 233, 253] },
  { bv: 0.4, rgb: [248, 245, 238] },
  { bv: 0.6, rgb: [255, 240, 214] },
  { bv: 0.8, rgb: [255, 230, 195] },
  { bv: 1.0, rgb: [255, 217, 172] },
  { bv: 1.2, rgb: [255, 204, 155] },
  { bv: 1.4, rgb: [255, 192, 142] },
  { bv: 1.7, rgb: [255, 178, 132] },
  { bv: 2.1, rgb: [255, 166, 124] },
];

const NEUTRAL: Rgb = [246, 244, 240];

export function starColor(bv: number): Rgb {
  if (!Number.isFinite(bv)) return NEUTRAL;
  if (bv <= COLOR_STOPS[0].bv) return COLOR_STOPS[0].rgb;
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  if (bv >= last.bv) return last.rgb;
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const b = COLOR_STOPS[i];
    if (bv <= b.bv) {
      const a = COLOR_STOPS[i - 1];
      const t = (bv - a.bv) / (b.bv - a.bv);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
      ];
    }
  }
  return NEUTRAL;
}

/* Zamiast setek odcieni używamy kubełków, dzięki czemu rysowanie można grupować
 * i ustawiać kolor wypełnienia tylko kilkanaście razy na klatkę zamiast tysiące. */
export const BUCKET_COUNT = 16;
const BV_MIN = -0.4;
const BV_MAX = 2.1;

export const BUCKET_RGB: Rgb[] = Array.from({ length: BUCKET_COUNT + 1 }, (_, i) => {
  if (i === BUCKET_COUNT) return NEUTRAL;
  const bv = BV_MIN + ((BV_MAX - BV_MIN) * (i + 0.5)) / BUCKET_COUNT;
  return starColor(bv);
});

export const BUCKET_CSS: string[] = BUCKET_RGB.map(([r, g, b]) => `rgb(${r} ${g} ${b})`);

/** Numer kubełka barwy. Ostatni kubełek zbiera gwiazdy bez pomiaru barwy. */
export function colorBucket(bv: number): number {
  if (!Number.isFinite(bv)) return BUCKET_COUNT;
  const t = (bv - BV_MIN) / (BV_MAX - BV_MIN);
  return Math.max(0, Math.min(BUCKET_COUNT - 1, Math.floor(t * BUCKET_COUNT)));
}

/*
 * Poświata jasnych gwiazd. Rysowanie gradientu promienistego dla każdej gwiazdy osobno
 * byłoby najdroższą operacją całej klatki, więc generujemy zestaw gotowych obrazków
 * i skalujemy je przy rysowaniu.
 */
const GLOW_SIZES = [8, 12, 18, 26, 38, 54];

export class GlowCache {
  private sprites = new Map<string, HTMLCanvasElement>();

  private build(bucket: number, size: number): HTMLCanvasElement {
    const [r, g, b] = BUCKET_RGB[bucket];
    const canvas = document.createElement('canvas');
    const d = size * 2;
    canvas.width = d;
    canvas.height = d;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const grad = ctx.createRadialGradient(size, size, 0, size, size, size);
    grad.addColorStop(0, `rgb(255 255 255 / 0.95)`);
    grad.addColorStop(0.12, `rgb(${r} ${g} ${b} / 0.92)`);
    grad.addColorStop(0.3, `rgb(${r} ${g} ${b} / 0.34)`);
    grad.addColorStop(0.62, `rgb(${r} ${g} ${b} / 0.08)`);
    grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, d, d);
    return canvas;
  }

  /** Najbliższy dostępny obrazek poświaty wraz z jego promieniem. */
  get(bucket: number, radius: number): { sprite: HTMLCanvasElement; size: number } {
    let size = GLOW_SIZES[GLOW_SIZES.length - 1];
    for (const candidate of GLOW_SIZES) {
      if (candidate >= radius) {
        size = candidate;
        break;
      }
    }
    const key = `${bucket}:${size}`;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = this.build(bucket, size);
      this.sprites.set(key, sprite);
    }
    return { sprite, size };
  }

  clear(): void {
    this.sprites.clear();
  }
}

/*
 * Promień gwiazdy na ekranie.
 *
 * Krzywa jest wykładnicza, bo tak działa skala wielkości gwiazdowych: różnica pięciu
 * wielkości to stukrotna różnica jasności. Podstawa 1.32 daje obraz zbliżony do tego,
 * co widać gołym okiem, bez zamieniania Syriusza w plamę.
 */
export function starRadius(mag: number, limitMag: number, gain: number): number {
  const r = 1.02 * Math.pow(1.32, limitMag - mag) * gain;
  return Math.max(0.5, Math.min(18, r));
}

/*
 * Graniczna wielkość gwiazdowa zależna od pola widzenia.
 * Przy szerokim kadrze pokazywanie najsłabszych gwiazd daje tylko szum,
 * przy wąskim mamy miejsce, żeby wejść w głąb katalogu.
 */
export function limitMagnitudeForFov(fovDeg: number, userLimit: number): number {
  const t = Math.max(0, Math.min(1, (fovDeg - 8) / (140 - 8)));
  const auto = 6.5 - t * 1.4;
  return Math.min(userLimit, auto);
}
