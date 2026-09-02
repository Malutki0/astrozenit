import { Rotation_EQJ_GAL } from 'astronomy-engine';

import type { SkyRotation } from '@/lib/catalog/horizontal';

/*
 * Droga Mleczna.
 *
 * Nie jest rysowana proceduralnie. Źródłem jest panorama całego nieba wykonana
 * przez Serge Bruniera w ramach projektu GigaGalaxy Zoom Europejskiego Obserwatorium
 * Południowego, udostępniona na licencji Creative Commons Attribution 4.0.
 * Obraz jest zapisany w odwzorowaniu walcowym we współrzędnych galaktycznych,
 * ze środkiem w centrum Galaktyki.
 *
 * Rysowanie polega na odwzorowaniu odwrotnym: dla punktów siatki rozpiętej na buforze
 * odczytujemy kierunek na niebie, zamieniamy go na współrzędne galaktyczne i stąd na
 * położenie w teksturze. Dla pikseli pomiędzy węzłami siatki współrzędne teksturowe
 * interpolujemy dwuliniowo, bo projekcja zmienia się gładko. Dzięki temu na klatkę
 * przypada około tysiąca dokładnych przeliczeń zamiast kilkudziesięciu tysięcy.
 */

const TEXTURE_URL = '/data/milkyway.jpg';

/** Odstęp węzłów siatki interpolacyjnej, w pikselach bufora. */
const GRID = 8;

export interface MilkyWayTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

let loading: Promise<MilkyWayTexture | null> | null = null;

/** Wczytuje panoramę i wypakowuje jej piksele. Kolejne wywołania korzystają z tej samej obietnicy. */
export function loadMilkyWayTexture(url = TEXTURE_URL): Promise<MilkyWayTexture | null> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0);
      try {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ width: canvas.width, height: canvas.height, data: pixels.data });
      } catch {
        /* Odczyt pikseli może się nie powieść przy nietypowej konfiguracji przeglądarki.
         * Warstwa po prostu się wtedy nie pojawia, reszta mapy działa dalej. */
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
  return loading;
}

/*
 * Macierz obrotu z układu równikowego J2000 do galaktycznego, spłaszczona do dziewięciu
 * liczb w tej samej konwencji, której używa reszta silnika.
 */
function galacticFromEquatorial(): Float64Array {
  const r = Rotation_EQJ_GAL().rot;
  const m = new Float64Array(9);
  m[0] = r[0][0];
  m[1] = r[1][0];
  m[2] = r[2][0];
  m[3] = r[0][1];
  m[4] = r[1][1];
  m[5] = r[2][1];
  m[6] = r[0][2];
  m[7] = r[1][2];
  m[8] = r[2][2];
  return m;
}

const EQJ_TO_GAL = galacticFromEquatorial();

/**
 * Składa obrót z układu horyzontalnego wprost do galaktycznego.
 *
 * Macierz nieba przenosi z układu równikowego do horyzontalnego, a że jest ortogonalna,
 * jej odwrotnością jest transpozycja. Mnożąc przez nią obrót do układu galaktycznego
 * otrzymujemy jedno przekształcenie, które w pętli rysowania kosztuje dziewięć mnożeń.
 */
export function horizonToGalactic(sky: SkyRotation, out = new Float64Array(9)): Float64Array {
  /* sky w postaci wierszowej: hor = S * eqj, więc eqj = S^T * hor. */
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        /* EQJ_TO_GAL[row][k] razy transpozycja sky, czyli sky[col][k]. */
        sum += EQJ_TO_GAL[row * 3 + k] * sky[col * 3 + k];
      }
      out[row * 3 + col] = sum;
    }
  }
  return out;
}

export interface MilkyWayDrawOptions {
  /** Bufor pomocniczy, zwykle o rozdzielczości obniżonej kilkukrotnie. */
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Ile razy bufor jest mniejszy od obszaru rysowania. */
  downscale: number;
  /** Odwzorowanie punktu ekranu na kierunek w układzie horyzontalnym. */
  unproject: (x: number, y: number) => { n: number; w: number; u: number };
  /** Obrót z układu horyzontalnego do galaktycznego. */
  matrix: Float64Array;
  texture: MilkyWayTexture;
  /** Siła warstwy, od 0 do 1. Wynika z jasności nieba i zanieczyszczenia światłem. */
  strength: number;
  /** Czy przycinać pas do obszaru nad horyzontem. */
  clipToHorizon: boolean;
  /** Bufor pikseli tworzony raz i używany ponownie, żeby nie obciążać odśmiecacza. */
  image: ImageData;
}

/**
 * Rysuje Drogę Mleczną do bufora.
 *
 * Zwraca fałsz, gdy nie ma czego rysować, na przykład w biały dzień
 * albo z centrum miasta, gdzie pas i tak jest niewidoczny.
 */
export function drawMilkyWayToBuffer(options: MilkyWayDrawOptions): boolean {
  const { ctx, width, height, downscale, unproject, matrix, texture, strength, clipToHorizon, image } =
    options;
  if (strength <= 0.02 || width < 2 || height < 2) return false;

  const out = image.data;
  /* Bufor jest używany ponownie, więc trzeba go wyzerować.
   * fill jest znacznie szybsze od przypisywania przezroczystości w pętli. */
  out.fill(0);
  const tex = texture.data;
  const tw = texture.width;
  const th = texture.height;

  const m0 = matrix[0];
  const m1 = matrix[1];
  const m2 = matrix[2];
  const m3 = matrix[3];
  const m4 = matrix[4];
  const m5 = matrix[5];
  const m6 = matrix[6];
  const m7 = matrix[7];
  const m8 = matrix[8];

  const cols = Math.ceil(width / GRID) + 1;
  const rows = Math.ceil(height / GRID) + 1;
  /* Dla każdego węzła siatki trzymamy położenie w teksturze oraz składową zenitalną,
   * potrzebną do przycięcia pasa do obszaru nad horyzontem i do ekstynkcji. */
  const nodeU = new Float32Array(cols * rows);
  const nodeV = new Float32Array(cols * rows);
  const nodeUp = new Float32Array(cols * rows);

  const INV_TWO_PI = 1 / (2 * Math.PI);
  const INV_PI = 1 / Math.PI;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const sx = Math.min(width - 1, gx * GRID) * downscale;
      const sy = Math.min(height - 1, gy * GRID) * downscale;
      const dir = unproject(sx, sy);

      const x = m0 * dir.n + m1 * dir.w + m2 * dir.u;
      const y = m3 * dir.n + m4 * dir.w + m5 * dir.u;
      const z = m6 * dir.n + m7 * dir.w + m8 * dir.u;

      /* Długość galaktyczna rośnie w lewo, stąd odejmowanie od połowy szerokości. */
      const lon = Math.atan2(y, x);
      const lat = Math.asin(Math.max(-1, Math.min(1, z)));
      const index = gy * cols + gx;
      nodeU[index] = 0.5 - lon * INV_TWO_PI;
      nodeV[index] = 0.5 - lat * INV_PI;
      nodeUp[index] = dir.u;
    }
  }

  /*
   * Szew tekstury. W obrębie jednej komórki współrzędna pozioma nie może przeskoczyć
   * o więcej niż pół obrazu, więc gdy tak się dzieje, przesuwamy mniejsze wartości
   * o pełny obrót. Bez tego przy przejściu przez antycentrum pojawiałby się pas
   * z rozciągniętą teksturą.
   */
  let any = false;

  for (let gy = 0; gy < rows - 1; gy++) {
    for (let gx = 0; gx < cols - 1; gx++) {
      const i00 = gy * cols + gx;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;

      let u00 = nodeU[i00];
      let u10 = nodeU[i10];
      let u01 = nodeU[i01];
      let u11 = nodeU[i11];
      const base = u00;
      if (u10 - base > 0.5) u10 -= 1;
      else if (base - u10 > 0.5) u10 += 1;
      if (u01 - base > 0.5) u01 -= 1;
      else if (base - u01 > 0.5) u01 += 1;
      if (u11 - base > 0.5) u11 -= 1;
      else if (base - u11 > 0.5) u11 += 1;

      const v00 = nodeV[i00];
      const v10 = nodeV[i10];
      const v01 = nodeV[i01];
      const v11 = nodeV[i11];
      const p00 = nodeUp[i00];
      const p10 = nodeUp[i10];
      const p01 = nodeUp[i01];
      const p11 = nodeUp[i11];

      const x0 = gx * GRID;
      const y0 = gy * GRID;
      const x1 = Math.min(width, x0 + GRID);
      const y1 = Math.min(height, y0 + GRID);

      for (let py = y0; py < y1; py++) {
        const fy = (py - y0) / GRID;
        const uL = u00 + (u01 - u00) * fy;
        const uR = u10 + (u11 - u10) * fy;
        const vL = v00 + (v01 - v00) * fy;
        const vR = v10 + (v11 - v10) * fy;
        const pL = p00 + (p01 - p00) * fy;
        const pR = p10 + (p11 - p10) * fy;
        let rowOffset = (py * width + x0) * 4;

        for (let px = x0; px < x1; px++) {
          const fx = (px - x0) / GRID;
          const up = pL + (pR - pL) * fx;

          if (clipToHorizon && up < 0) {
            rowOffset += 4;
            continue;
          }

          /* Tuż nad horyzontem pas gaśnie przez ekstynkcję atmosferyczną. */
          const extinction = clipToHorizon ? Math.min(1, Math.max(0, up * 6)) : 1;
          if (extinction <= 0.01) {
            rowOffset += 4;
            continue;
          }

          let tu = uL + (uR - uL) * fx;
          const tv = vL + (vR - vL) * fx;
          tu -= Math.floor(tu);

          const tx = (tu * tw) | 0;
          const ty = Math.max(0, Math.min(th - 1, (tv * th) | 0));
          const t = (ty * tw + (tx >= tw ? tw - 1 : tx)) * 4;

          const gain = strength * extinction;
          out[rowOffset] = tex[t] * gain;
          out[rowOffset + 1] = tex[t + 1] * gain;
          out[rowOffset + 2] = tex[t + 2] * gain;
          out[rowOffset + 3] = 255;
          any = true;
          rowOffset += 4;
        }
      }
    }
  }

  if (any) ctx.putImageData(image, 0, 0);
  return any;
}
