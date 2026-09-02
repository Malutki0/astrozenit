/*
 * Zenit: budowa atlasu tekstur planet.
 *
 * Pobiera mapy powierzchni ciał Układu Słonecznego, zmniejsza je i skleja w jeden
 * obraz. Jeden plik zamiast dziewięciu oznacza jedno żądanie sieciowe i jedno
 * dekodowanie przy starcie warstwy planet.
 *
 * Uruchomienie: npm run build:textures
 *
 * Źródło: Solar System Scope, solarsystemscope.com/textures
 * Licencja: Creative Commons Attribution 4.0 International
 * Mapy powstały na podstawie zdjęć NASA i są dostępne do dowolnego użytku
 * pod warunkiem podania autorstwa.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import zlib from 'node:zlib';

import jpeg from 'jpeg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'textures');
const OUT = path.join(ROOT, 'public', 'data');

const BASE = 'https://www.solarsystemscope.com/textures/download';

/*
 * Kolejność w atlasie jest stała i powtórzona w kodzie aplikacji.
 * Trzy wiersze po cztery kolumny mieszczą dziewięć ciał z zapasem.
 *
 * Słońce jest tu z innego powodu niż reszta. Na mapie nieba rysujemy je jako jasny
 * krążek z poświatą, bo tak wygląda gołym okiem i żadna mapa powierzchni tego nie zmieni.
 * W panelu obiektu chodzi natomiast o pokazanie, czym Słońce jest: mapa fotosfery
 * z widocznymi plamami i granulacją mówi o tym więcej niż biały dysk.
 */
const BODIES = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'moon',
  'sun',
];

/*
 * Nazwy plików w źródle nie zawsze pokrywają się z nazwami ciał.
 * Dla Wenus bierzemy mapę chmur, a nie powierzchni, bo z Ziemi widzimy
 * właśnie szczyty chmur, a nie grunt pod nimi.
 */
const FILE_NAMES = { venus: 'venus_atmosphere', earth: 'earth_daymap' };

const CELL_W = 512;
const CELL_H = 256;
const COLUMNS = 4;

const log = (...a) => console.log('  ', ...a);

/*
 * PIERŚCIENIE SATURNA
 *
 * Pierścienie nie mieszczą się w atlasie map powierzchni, bo nie są mapą kuli,
 * tylko profilem promieniowym: barwa i przezroczystość zależą wyłącznie od
 * odległości od planety, a nie od długości i szerokości. Źródłowy plik jest
 * paskiem o wymiarach 2048 na 125 pikseli, w którym oś pozioma to właśnie promień.
 *
 * Zapisujemy z niego 256 próbek RGBA. Tyle wystarcza: cała informacja w tym pasku
 * to kilkanaście przejść jasności, z których najwęższe, przerwa Cassiniego, zajmuje
 * około trzech procent szerokości, czyli osiem próbek.
 *
 * Zakres promieni wyznaczony pomiarowo z samego profilu. Przezroczystość rośnie
 * od zera przy ułamku 0,10 i załamuje się przy 0,70. Po podstawieniu rzeczywistych
 * położeń, wewnętrznej krawędzi pierścienia C przy 1,239 promienia Saturna
 * i przerwy Cassiniego przy 1,95 do 2,02, wychodzi, że pasek obejmuje zakres
 * od 1,11 do 2,35 promienia planety. Sprawdzenie kontrolne: zewnętrzna krawędź
 * pierścienia B przy 1,95 wypada wtedy na ułamku 0,68, a w profilu przezroczystość
 * spada właśnie tam.
 */
const RING_INNER_R = 1.11;
const RING_OUTER_R = 2.35;
const RING_SAMPLES = 256;

/* Minimalny dekoder PNG: osiem bitów na kanał, RGBA, bez przeplotu. Tyle wystarcza
 * dla tego jednego pliku, a jest tańsze niż dokładanie zależności do projektu. */
function decodePng(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (buffer[24] !== 8 || buffer[25] !== 6 || buffer[28] !== 0) {
    throw new Error('Oczekiwano PNG RGBA osiem bitów bez przeplotu');
  }

  const kawalki = [];
  let off = 8;
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off);
    const typ = buffer.toString('ascii', off + 4, off + 8);
    if (typ === 'IDAT') kawalki.push(buffer.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(kawalki));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  let p = 0;
  for (let y = 0; y < height; y++) {
    const filtr = raw[p++];
    const linia = raw.subarray(p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let v = linia[i];
      if (filtr === 1) v += a;
      else if (filtr === 2) v += b;
      else if (filtr === 3) v += (a + b) >> 1;
      else if (filtr === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, data: out };
}

async function buildRings() {
  const file = path.join(CACHE, 'saturn_ring.png');
  let buffer;
  try {
    buffer = await readFile(file);
    log(`cache: pierścienie (${(buffer.length / 1024).toFixed(0)} KB)`);
  } catch {
    const url = `${BASE}/2k_saturn_ring_alpha.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} zwrócił ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buffer);
    log(`pobrano: pierścienie (${(buffer.length / 1024).toFixed(0)} KB)`);
  }

  const { width, height, data } = decodePng(buffer);
  const stride = width * 4;

  /* Uśredniamy po wysokości paska i po szerokości próbki, żeby pojedynczy
   * jasny piksel nie zdominował całego pierścienia. */
  const profil = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const od = Math.floor((i * width) / RING_SAMPLES);
    const doX = Math.max(od + 1, Math.floor(((i + 1) * width) / RING_SAMPLES));
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (let y = 0; y < height; y++) {
      for (let x = od; x < doX; x++) {
        const o = y * stride + x * 4;
        r += data[o];
        g += data[o + 1];
        b += data[o + 2];
        a += data[o + 3];
        n++;
      }
    }
    profil.push(Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n));
  }

  await writeFile(
    path.join(OUT, 'rings.json'),
    JSON.stringify({
      body: 'saturn',
      innerRadius: RING_INNER_R,
      outerRadius: RING_OUTER_R,
      samples: RING_SAMPLES,
      rgba: profil,
      source: 'Solar System Scope, solarsystemscope.com/textures',
      license: 'CC BY 4.0',
    }),
  );
  log(`pierścienie: ${RING_SAMPLES} próbek, od ${RING_INNER_R} do ${RING_OUTER_R} promienia`);
}

async function ensure(name) {
  const file = path.join(CACHE, `${name}.jpg`);
  try {
    const s = await stat(file);
    if (s.size > 0) {
      log(`cache: ${name} (${(s.size / 1024).toFixed(0)} KB)`);
      return file;
    }
  } catch {
    /* Pobieramy poniżej. */
  }
  const url = `${BASE}/2k_${FILE_NAMES[name] ?? name}.jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} zwrócił ${res.status}`);
  /* Serwis odpowiada stroną błędu ze statusem 200 na niektóre nieistniejące ścieżki,
   * więc sprawdzamy jeszcze typ zawartości. */
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`${url} zwrócił ${type} zamiast obrazu`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  const s = await stat(file);
  log(`pobrano: ${name} (${(s.size / 1024).toFixed(0)} KB)`);
  return file;
}

/*
 * Zmniejszanie przez uśrednianie pudełkowe.
 * Prosty wybór najbliższego piksela dawałby przy tak dużej redukcji widoczne
 * schodkowanie na pasach Jowisza i na krawędziach mórz księżycowych.
 */
function downsample(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 3);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.min(srcH, Math.ceil((y + 1) * scaleY));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.min(srcW, Math.ceil((x + 1) * scaleX));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let o = (sy * srcW + x0) * 4;
        for (let sx = x0; sx < x1; sx++) {
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          n++;
          o += 4;
        }
      }
      const d = (y * dstW + x) * 3;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
    }
  }
  return out;
}

async function main() {
  console.log('\nZenit: budowa atlasu tekstur planet\n');
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });

  const rows = Math.ceil(BODIES.length / COLUMNS);
  const atlasW = CELL_W * COLUMNS;
  const atlasH = CELL_H * rows;
  const atlas = Buffer.alloc(atlasW * atlasH * 4, 255);

  for (let i = 0; i < BODIES.length; i++) {
    const name = BODIES[i];
    const file = await ensure(name);
    const decoded = jpeg.decode(await readFile(file), { useTArray: true, formatAsRGBA: true });
    const cell = downsample(decoded.data, decoded.width, decoded.height, CELL_W, CELL_H);

    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const offsetX = col * CELL_W;
    const offsetY = row * CELL_H;

    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const s = (y * CELL_W + x) * 3;
        const d = ((offsetY + y) * atlasW + offsetX + x) * 4;
        atlas[d] = cell[s];
        atlas[d + 1] = cell[s + 1];
        atlas[d + 2] = cell[s + 2];
        atlas[d + 3] = 255;
      }
    }
    log(`${name}: ${decoded.width}x${decoded.height} -> ${CELL_W}x${CELL_H}, komórka ${col},${row}`);
  }

  const encoded = jpeg.encode({ data: atlas, width: atlasW, height: atlasH }, 82);
  await writeFile(path.join(OUT, 'planets.jpg'), encoded.data);

  const manifest = {
    columns: COLUMNS,
    rows,
    cellWidth: CELL_W,
    cellHeight: CELL_H,
    bodies: BODIES,
    source: 'Solar System Scope, solarsystemscope.com/textures',
    license: 'CC BY 4.0',
  };
  await writeFile(path.join(OUT, 'planets.json'), JSON.stringify(manifest));

  log(`atlas: ${atlasW}x${atlasH}, ${(encoded.data.length / 1024).toFixed(0)} KB`);

  await buildRings();
  console.log('\nGotowe.');
}

main().catch((err) => {
  console.error('\nBłąd budowy tekstur:', err);
  process.exit(1);
});
