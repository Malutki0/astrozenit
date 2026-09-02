/*
 * Zenit: generator katalogu.
 *
 * Pobiera surowe źródła, przelicza je na zwarte artefakty w public/data
 * i dopisuje polską warstwę nazw oraz opisów. Artefakty trafiają do repozytorium,
 * więc aplikacja w czasie działania nie potrzebuje sieci.
 *
 * Uruchomienie: npm run build:catalog
 *
 * Źródła:
 *   HYG Database v41              CC BY-SA 4.0   github.com/astronexus/HYG-Database
 *     pozycje, jasności, odległości i typy widmowe gwiazd
 *   Stellarium                    GPL-2.0        github.com/Stellarium/stellarium
 *     figury gwiazdozbiorów po numerach HIP, granice IAU, asteryzmy,
 *     nazwy własne gwiazd, polskie tłumaczenia nazw i dopełniaczy,
 *     baza lokalizacji ze skalą Bortle'a
 *   GeoNames cities5000           CC BY 4.0      geonames.org
 *     poprawna pisownia nazw miejscowości wraz z polskimi znakami
 *   d3-celestial                  BSD 3-Clause   github.com/ofrohn/d3-celestial
 *     katalog Messiera
 */

import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { Constellation, InverseRotation, Rotation_EQJ_EQD } from 'astronomy-engine';

import {
  ASTERISMS_PL,
  GENITIVE_OVERRIDES,
  NAME_OVERRIDES,
  SEASONS,
} from './data/constellations-pl.mjs';
import { DSO_PL, DSO_TYPES_PL, DSO_TYPE_OVERRIDE } from './data/dso-pl.mjs';
import { STAR_NAMES_PL, STAR_NOTES_PL } from './data/stars-pl.mjs';
import { CITY_NAMES_PL, COUNTRY_NAMES_PL, EXCLUDED_DISTRICTS } from './data/locations-pl.mjs';
import { lookup, lookupStrict, parsePo } from './lib/po.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');

const MAG_LIMIT = 6.5;
const NAMED_MAG_LIMIT = 4.0;

const STELLARIUM = 'https://raw.githubusercontent.com/Stellarium/stellarium/master';

const SOURCES = {
  hyg: {
    url: 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
    file: 'hygdata_v41.csv',
  },
  messier: {
    url: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/messier.json',
    file: 'messier.json',
  },
  stelModern: { url: `${STELLARIUM}/skycultures/modern/index.json`, file: 'stellarium-modern.json' },
  stelSkyPo: { url: `${STELLARIUM}/po/stellarium-sky/pl.po`, file: 'stellarium-sky-pl.po' },
  stelCulturesPo: {
    url: `${STELLARIUM}/po/stellarium-skycultures/pl.po`,
    file: 'stellarium-skycultures-pl.po',
  },
  stelLocations: { url: `${STELLARIUM}/data/base_locations.txt`, file: 'base_locations.txt' },
  geonames: {
    url: 'https://download.geonames.org/export/dump/cities5000.zip',
    file: 'cities5000.zip',
    unzipTo: 'cities5000.txt',
  },
};

const DEG = Math.PI / 180;
const PARSEC_LY = 3.2615637769;

const log = (...a) => console.log('  ', ...a);

async function ensure(source) {
  const dest = path.join(CACHE, source.file);
  try {
    const s = await stat(dest);
    if (s.size > 0) {
      log(`cache: ${source.file} (${(s.size / 1048576).toFixed(1)} MB)`);
      return dest;
    }
  } catch {
    /* Brak pliku, pobieramy poniżej. */
  }
  log(`pobieram: ${source.file}`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.url} zwrócił ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const s = await stat(dest);
  log(`zapisano: ${source.file} (${(s.size / 1048576).toFixed(1)} MB)`);
  return dest;
}

/** Pobiera archiwum i rozpakowuje wskazany plik, korzystając z systemowego unzip. */
async function ensureUnzipped(source) {
  const target = path.join(CACHE, source.unzipTo);
  try {
    const s = await stat(target);
    if (s.size > 0) {
      log(`cache: ${source.unzipTo} (${(s.size / 1048576).toFixed(1)} MB)`);
      return target;
    }
  } catch {
    /* Rozpakowujemy poniżej. */
  }
  const archive = await ensure(source);
  execFileSync('unzip', ['-o', '-q', archive, source.unzipTo, '-d', CACHE]);
  log(`rozpakowano: ${source.unzipTo}`);
  return target;
}

/* Parser CSV odporny na cudzysłowy i przecinki wewnątrz pól. */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

const SPECTRAL_PL = {
  O: 'błękitna',
  B: 'błękitno-biała',
  A: 'biała',
  F: 'biało-żółta',
  G: 'żółta',
  K: 'pomarańczowa',
  M: 'czerwona',
  C: 'głęboko czerwona',
  S: 'czerwona',
  W: 'błękitna',
};

const GREEK_PL = {
  alp: 'Alfa', bet: 'Beta', gam: 'Gamma', del: 'Delta', eps: 'Epsilon', zet: 'Zeta',
  eta: 'Eta', the: 'Theta', iot: 'Jota', kap: 'Kappa', lam: 'Lambda', mu: 'Mi',
  nu: 'Ni', xi: 'Ksi', omi: 'Omikron', pi: 'Pi', rho: 'Rho', sig: 'Sigma',
  tau: 'Tau', ups: 'Ipsylon', phi: 'Fi', chi: 'Chi', psi: 'Psi', ome: 'Omega',
};

function bayerPl(bayer) {
  if (!bayer) return null;
  const m = bayer.match(/^([A-Za-z]+)(\d*)$/);
  if (!m) return bayer;
  const greek = GREEK_PL[m[1].toLowerCase()];
  if (!greek) return bayer;
  return m[2] ? `${greek}${m[2]}` : greek;
}

/* ------------------------------------------------------------------ gwiazdy */

async function buildStars(stelData) {
  const file = await ensure(SOURCES.hyg);
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h.replace(/"/g, ''), i]));

  for (const n of ['hip', 'proper', 'ra', 'dec', 'dist', 'mag', 'absmag', 'spect', 'ci', 'bayer', 'flam', 'con']) {
    if (col[n] === undefined) throw new Error(`brak kolumny ${n} w HYG`);
  }

  /* Nazwy własne gwiazd ze Stellarium, indeksowane numerem katalogu Hipparcosa. */
  const stelNames = new Map();
  for (const [key, entries] of Object.entries(stelData.common_names ?? {})) {
    const m = key.match(/^HIP\s+(\d+)$/);
    if (!m || !Array.isArray(entries) || entries.length === 0) continue;
    stelNames.set(Number(m[1]), {
      primary: entries[0].english ?? entries[0].native,
      alternates: entries.slice(1).map((e) => e.english ?? e.native).filter(Boolean),
    });
  }

  const rows = [];
  const byHip = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = parseCsvLine(line);
    const mag = parseFloat(f[col.mag]);
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
    const ra = parseFloat(f[col.ra]);
    const dec = parseFloat(f[col.dec]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    const proper = f[col.proper]?.trim() ?? '';
    if (proper === 'Sol') continue;
    const row = {
      hip: parseInt(f[col.hip], 10) || 0,
      proper,
      ra,
      dec,
      dist: parseFloat(f[col.dist]),
      mag,
      absmag: parseFloat(f[col.absmag]),
      spect: f[col.spect]?.trim() ?? '',
      ci: parseFloat(f[col.ci]),
      bayer: f[col.bayer]?.trim() ?? '',
      flam: f[col.flam]?.trim() ?? '',
      con: f[col.con]?.trim() ?? '',
    };
    rows.push(row);
    if (row.hip && !byHip.has(row.hip)) byHip.set(row.hip, row);
  }

  rows.sort((a, b) => a.mag - b.mag);
  const count = rows.length;

  /* Format binarny: nagłówek, potem pięć równoległych tablic.
   * Kolejność dobrana tak, żeby każda tablica startowała pod właściwym wyrównaniem. */
  const buffer = new ArrayBuffer(8 + count * 16);
  const view = new DataView(buffer);
  view.setUint8(0, 0x5a);
  view.setUint8(1, 0x4e);
  view.setUint8(2, 0x53);
  view.setUint8(3, 0x31);
  view.setUint32(4, count, true);

  const raArr = new Float32Array(buffer, 8, count);
  const decArr = new Float32Array(buffer, 8 + count * 4, count);
  const magArr = new Int16Array(buffer, 8 + count * 8, count);
  const ciArr = new Int16Array(buffer, 8 + count * 10, count);
  const hipArr = new Int32Array(buffer, 8 + count * 12, count);

  rows.forEach((r, i) => {
    raArr[i] = r.ra * 15 * DEG;
    decArr[i] = r.dec * DEG;
    magArr[i] = Math.round(r.mag * 100);
    ciArr[i] = Number.isFinite(r.ci) ? Math.round(r.ci * 1000) : -32768;
    hipArr[i] = r.hip;
  });

  await writeFile(path.join(OUT, 'stars.bin'), Buffer.from(buffer));

  /* Warstwa opisowa: gwiazdy z nazwą własną oraz wszystkie jaśniejsze od progu. */
  let fromStellarium = 0;
  const named = rows
    .filter((r) => r.proper || stelNames.has(r.hip) || r.mag <= NAMED_MAG_LIMIT)
    .map((r) => {
      const stel = stelNames.get(r.hip);
      if (!r.proper && stel) fromStellarium++;
      const iau = r.proper || stel?.primary || null;
      const spectClass = r.spect ? r.spect[0].toUpperCase() : null;
      const distLy =
        Number.isFinite(r.dist) && r.dist > 0 && r.dist < 100000 ? r.dist * PARSEC_LY : null;
      return {
        hip: r.hip || null,
        name: (iau && STAR_NAMES_PL[iau]) ?? iau,
        nameIau: iau,
        alt: stel?.alternates.length ? stel.alternates.slice(0, 3) : null,
        bayer: r.bayer || null,
        bayerPl: bayerPl(r.bayer),
        flam: r.flam ? Number(r.flam) : null,
        con: r.con || null,
        ra: Number(r.ra.toFixed(6)),
        dec: Number(r.dec.toFixed(6)),
        mag: Number(r.mag.toFixed(2)),
        absMag: Number.isFinite(r.absmag) ? Number(r.absmag.toFixed(2)) : null,
        distLy: distLy ? Number(distLy.toFixed(1)) : null,
        spect: r.spect || null,
        spectClass,
        color: spectClass ? (SPECTRAL_PL[spectClass] ?? null) : null,
        note: iau ? (STAR_NOTES_PL[iau] ?? null) : null,
      };
    })
    /*
     * Odrzucamy pozycje, których nie da się nazwać.
     *
     * Katalog HYG zawiera osobne wiersze dla składników gwiazd wielokrotnych.
     * Część z nich nie ma ani nazwy własnej, ani oznaczenia Bayera lub Flamsteeda,
     * ani numeru Hipparcosa, bo cały układ figuruje pod numerem składnika głównego.
     * Taka pozycja trafiała na listę jako "HIP null", czyli podpis, który nie mówi
     * nic i wygląda na usterkę, a przy tym powiela gwiazdę już na liście obecną:
     * jedna z nich to towarzysz Kapelli, druga towarzysz Sabika.
     *
     * Sam wiersz zostaje w stars.bin, więc na mapie kropka jest rysowana tam,
     * gdzie należy. Znika tylko z listy, na której nie da się jej sensownie podpisać.
     */
    .filter((s) => s.name || s.bayerPl || s.flam || s.hip);

  log(`gwiazd do mag ${MAG_LIMIT}: ${count}`);
  log(`stars.bin: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
  log(`warstwa opisowa: ${named.length} pozycji`);
  log(`nazwy własne: ${named.filter((s) => s.nameIau).length}, w tym ${fromStellarium} dodanych ze Stellarium`);
  return { count, named, byHip };
}

/* ---------------------------------------------------------- gwiazdozbiory */

/** Środek figury liczony na wektorach jednostkowych, odporny na przejście przez 0h. */
function centroid(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [raHours, decDeg] of points) {
    const ra = raHours * 15 * DEG;
    const dec = decDeg * DEG;
    x += Math.cos(dec) * Math.cos(ra);
    y += Math.cos(dec) * Math.sin(ra);
    z += Math.sin(dec);
  }
  const n = points.length || 1;
  x /= n;
  y /= n;
  z /= n;
  const r = Math.hypot(x, y, z) || 1;
  const dec = Math.asin(z / r) / DEG;
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  return [Number((ra / 15).toFixed(5)), Number(dec.toFixed(4))];
}

/* Łacińskie dopełniacze gwiazdozbiorów. Klucz to skrót IAU. Stellarium przechowuje
 * polskie odpowiedniki pod kluczem łacińskiego dopełniacza, więc potrzebujemy tej mapy. */
const LATIN_GENITIVES = {
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aql: 'Aquilae', Aqr: 'Aquarii',
  Ara: 'Arae', Ari: 'Arietis', Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli',
  Cam: 'Camelopardalis', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae',
  Cen: 'Centauri', Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini',
  CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cnc: 'Cancri', Col: 'Columbae',
  Com: 'Comae Berenices', CrA: 'Coronae Australis', CrB: 'Coronae Borealis',
  Crt: 'Crateris', Cru: 'Crucis', Crv: 'Corvi', CVn: 'Canum Venaticorum',
  Cyg: 'Cygni', Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei',
  Eri: 'Eridani', For: 'Fornacis', Gem: 'Geminorum', Gru: 'Gruis', Her: 'Herculis',
  Hor: 'Horologii', Hya: 'Hydrae', Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae',
  Leo: 'Leonis', Lep: 'Leporis', Lib: 'Librae', LMi: 'Leonis Minoris', Lup: 'Lupi',
  Lyn: 'Lyncis', Lyr: 'Lyrae', Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis',
  Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis', Oph: 'Ophiuchi', Ori: 'Orionis',
  Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris',
  PsA: 'Piscis Austrini', Psc: 'Piscium', Pup: 'Puppis', Pyx: 'Pyxidis',
  Ret: 'Reticuli', Scl: 'Sculptoris', Sco: 'Scorpii', Sct: 'Scuti', Ser: 'Serpentis',
  Sex: 'Sextantis', Sge: 'Sagittae', Sgr: 'Sagittarii', Tau: 'Tauri',
  Tel: 'Telescopii', TrA: 'Trianguli Australis', Tri: 'Trianguli', Tuc: 'Tucanae',
  UMa: 'Ursae Majoris', UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis',
  Vol: 'Volantis', Vul: 'Vulpeculae',
};

async function buildConstellations(stelData, stars, po) {
  const { byHip, named } = stars;

  /* Najjaśniejsza gwiazda w każdym gwiazdozbiorze, na podstawie warstwy opisowej. */
  const brightest = new Map();
  for (const s of named) {
    if (!s.con) continue;
    const cur = brightest.get(s.con);
    if (!cur || s.mag < cur.mag) brightest.set(s.con, s);
  }

  const out = [];
  const missingHip = new Set();
  let segments = 0;

  for (const c of stelData.constellations) {
    const id = c.id.replace('CON modern ', '');
    const english = c.common_name?.english ?? id;
    const latin = c.common_name?.native ?? english;
    const plStel = lookup(po.cultures, english, 'IAU constellation name', 'constellation');
    const pl = NAME_OVERRIDES[id] ?? plStel ?? latin;

    const latinGen = LATIN_GENITIVES[id] ?? null;
    const genStel = latinGen
      ? lookupStrict(po.sky, latinGen, 'Genitive name of constellation')
      : null;
    const genitive = GENITIVE_OVERRIDES[id] ?? genStel ?? null;

    /* Figury Stellarium podane są jako łańcuchy numerów HIP. Rozwiązujemy je
     * na współrzędne z katalogu HYG, dzięki czemu linie kończą się dokładnie
     * na gwiazdach, które rysujemy, a nie w ich pobliżu. */
    const all = [];
    const shape = [];
    for (const chain of c.lines) {
      const seg = [];
      for (const hip of chain) {
        const star = byHip.get(hip);
        if (!star) {
          missingHip.add(`${id}:${hip}`);
          /* Przerwa w łańcuchu kończy odcinek, żeby nie łączyć niesąsiadujących gwiazd. */
          if (seg.length > 1) {
            shape.push([...seg]);
            segments++;
          }
          seg.length = 0;
          continue;
        }
        const point = [Number(star.ra.toFixed(5)), Number(star.dec.toFixed(4))];
        seg.push(point);
        all.push(point);
      }
      if (seg.length > 1) {
        shape.push(seg);
        segments++;
      }
    }

    if (all.length === 0) {
      console.warn(`   uwaga: brak punktów figury dla ${id}`);
      continue;
    }

    const decs = all.map((p) => p[1]);
    const star = brightest.get(id) ?? null;

    out.push({
      id,
      la: latin,
      gen: latinGen,
      en: english,
      byname: c.common_name?.byname ?? null,
      pl,
      genPl: genitive,
      season: SEASONS[id] ?? null,
      /* Ranga steruje kolejnością podpisów: figury jasne i duże wygrywają konkurencję
       * o miejsce na ekranie. Wyliczamy ją z jasności najjaśniejszej gwiazdy. */
      rank: star ? (star.mag < 1.6 ? 1 : star.mag < 3 ? 2 : 3) : 3,
      lines: shape,
      center: centroid(all),
      decMin: Number(Math.min(...decs).toFixed(2)),
      decMax: Number(Math.max(...decs).toFixed(2)),
      brightest: star ? { name: star.name ?? star.bayerPl ?? null, mag: star.mag, hip: star.hip } : null,
      starCount: new Set(c.lines.flat()).size,
    });
  }

  /*
   * Kontrola spójności. Dwa gwiazdozbiory nie mogą dzielić tej samej nazwy ani tego
   * samego dopełniacza. Ta kontrola wychwyciła błąd w tłumaczeniu Stellarium,
   * gdzie dopełniacz Centaura był podany jako dopełniacz Byka.
   */
  for (const field of ['pl', 'genPl']) {
    const seen = new Map();
    for (const c of out) {
      const value = c[field];
      if (!value) continue;
      if (seen.has(value)) {
        console.warn(`   uwaga: ${field} "${value}" powtarza się dla ${seen.get(value)} i ${c.id}`);
      } else {
        seen.set(value, c.id);
      }
    }
  }

  out.sort((a, b) => a.pl.localeCompare(b.pl, 'pl'));
  await writeFile(path.join(OUT, 'constellations.json'), JSON.stringify(out));
  log(`gwiazdozbiorów: ${out.length}, odcinków linii: ${segments}`);
  log(`nazw polskich ze Stellarium: ${out.filter((c) => !NAME_OVERRIDES[c.id]).length}, nadpisanych: ${Object.keys(NAME_OVERRIDES).length}`);
  log(`dopełniaczy: ${out.filter((c) => c.genPl).length} z ${out.length}`);
  if (missingHip.size) log(`nierozwiązane numery HIP: ${missingHip.size}`);
  return out;
}

/* ------------------------------------------------------------- granice IAU */

/*
 * Granice gwiazdozbiorów podane są w epoce B1875, bo tak zostały zdefiniowane
 * przez Międzynarodową Unię Astronomiczną w 1930 roku. Żeby narysować je razem
 * z gwiazdami, trzeba je przenieść do epoki J2000.
 *
 * Wykorzystujemy macierz obrotu silnika efemeryd dla chwili odpowiadającej B1875.0
 * i odwracamy ją. Macierz zawiera także nutację, której w definicji granic nie ma,
 * ale jej wpływ nie przekracza dwudziestu sekund łuku, czyli ułamka piksela
 * przy każdym praktycznym przybliżeniu mapy.
 */
function b1875ToJ2000Rotation() {
  /* Epoka besselowska B1875.0 wypada w chwili JD 2405889.25855. */
  const JD_B1875 = 2415020.31352 - 25 * 365.242198781;
  const unixMs = (JD_B1875 - 2440587.5) * 86400000;
  const time = new Date(unixMs);
  return InverseRotation(Rotation_EQJ_EQD(time));
}

function parseSexagesimal(ra, dec) {
  const [h, m, s] = ra.split(':').map(Number);
  const raHours = h + m / 60 + (s || 0) / 3600;
  const sign = dec.trim().startsWith('-') ? -1 : 1;
  const [d, dm, ds] = dec.replace(/^[+-]/, '').split(':').map(Number);
  const decDeg = sign * (d + dm / 60 + (ds || 0) / 3600);
  return [raHours, decDeg];
}

function rotatePoint(rot, raHours, decDeg) {
  const ra = raHours * 15 * DEG;
  const dec = decDeg * DEG;
  const cosDec = Math.cos(dec);
  const x = cosDec * Math.cos(ra);
  const y = cosDec * Math.sin(ra);
  const z = Math.sin(dec);
  const r = rot.rot;
  const nx = r[0][0] * x + r[1][0] * y + r[2][0] * z;
  const ny = r[0][1] * x + r[1][1] * y + r[2][1] * z;
  const nz = r[0][2] * x + r[1][2] * y + r[2][2] * z;
  let outRa = Math.atan2(ny, nx) / DEG;
  if (outRa < 0) outRa += 360;
  return [Number((outRa / 15).toFixed(5)), Number((Math.asin(Math.max(-1, Math.min(1, nz))) / DEG).toFixed(4))];
}

async function buildBoundaries(stelData) {
  const rot = b1875ToJ2000Rotation();
  const out = [];

  for (const edge of stelData.edges) {
    const parts = edge.trim().split(/\s+/);
    if (parts.length < 8) continue;
    const type = parts[1];
    const [ra1, dec1] = parseSexagesimal(parts[2], parts[3]);
    const [ra2, dec2] = parseSexagesimal(parts[4], parts[5]);

    /* Odcinki typu P biegną po równoleżniku, czyli po stałej deklinacji.
     * Rysowane jako łuk wielkiego koła wybrzuszyłyby się, więc dzielimy je
     * na kroki i każdy punkt przenosimy do J2000 osobno. */
    const points = [];
    if (type.startsWith('P')) {
      let span = ra2 - ra1;
      if (span > 12) span -= 24;
      if (span < -12) span += 24;
      const steps = Math.max(2, Math.ceil(Math.abs(span) * 4));
      for (let i = 0; i <= steps; i++) {
        points.push(rotatePoint(rot, ra1 + (span * i) / steps, dec1));
      }
    } else {
      const steps = Math.max(2, Math.ceil(Math.abs(dec2 - dec1) / 3));
      for (let i = 0; i <= steps; i++) {
        points.push(rotatePoint(rot, ra1, dec1 + ((dec2 - dec1) * i) / steps));
      }
    }
    out.push(points);
  }

  await writeFile(path.join(OUT, 'boundaries.json'), JSON.stringify(out));
  const size = JSON.stringify(out).length;
  log(`granic IAU: ${out.length} odcinków, ${(size / 1024).toFixed(0)} KB`);
  return out;
}

/* ---------------------------------------------------------------- asteryzmy */

async function buildAsterisms(stelData, stars) {
  const { byHip } = stars;
  const out = [];

  for (const a of stelData.asterisms) {
    const id = a.id.replace('AST modern ', '');
    const pl = ASTERISMS_PL[id];
    if (!pl) continue;

    const all = [];
    const shape = [];
    for (const chain of a.lines) {
      const seg = [];
      for (const hip of chain) {
        const star = byHip.get(hip);
        if (!star) continue;
        const point = [Number(star.ra.toFixed(5)), Number(star.dec.toFixed(4))];
        seg.push(point);
        all.push(point);
      }
      if (seg.length > 1) shape.push(seg);
    }
    if (all.length < 2) {
      console.warn(`   uwaga: asteryzm ${id} bez wystarczającej liczby gwiazd`);
      continue;
    }

    out.push({
      id,
      pl: pl.pl,
      en: a.common_name?.english ?? id,
      note: pl.note,
      lines: shape,
      center: centroid(all),
    });
  }

  out.sort((a, b) => a.pl.localeCompare(b.pl, 'pl'));
  await writeFile(path.join(OUT, 'asterisms.json'), JSON.stringify(out));
  log(`asteryzmów: ${out.length}`);
  return out;
}

/* ------------------------------------------- obiekty głębokiego nieba */

async function buildDso(constellations) {
  const file = await ensure(SOURCES.messier);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const conPl = new Map(constellations.map((c) => [c.id, c.pl]));
  const types = new Set();

  const out = data.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const raDeg = lon < 0 ? lon + 360 : lon;
    const ra = raDeg / 15;
    types.add(p.type);
    const typeInfo = DSO_TYPE_OVERRIDE[p.name] ?? DSO_TYPES_PL[p.type] ?? DSO_TYPES_PL.other;
    const extra = DSO_PL[p.name] ?? {};
    const con = Constellation(ra, lat);
    return {
      id: p.name,
      ngc: p.desig || null,
      /* Pole alt bywa pustym łańcuchem, a nie wartością pustą, więc nie wystarczy
       * operator łączenia z wartością pustą. */
      name: extra.pl ?? (p.alt || null) ?? p.name,
      nameEn: p.alt || null,
      type: p.type,
      typePl: typeInfo.pl,
      cat: typeInfo.cat,
      mag: Number.isFinite(p.mag) ? p.mag : null,
      dim: p.dim || null,
      ra: Number(ra.toFixed(5)),
      dec: Number(lat.toFixed(4)),
      con: con.symbol,
      conPl: conPl.get(con.symbol) ?? con.name,
      note: extra.note ?? null,
    };
  });

  out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  await writeFile(path.join(OUT, 'dso.json'), JSON.stringify(out));
  log(`obiektów Messiera: ${out.length}`);
  const missing = [...types].filter((t) => !DSO_TYPES_PL[t]);
  if (missing.length) console.warn(`   uwaga: nieprzetłumaczone typy: ${missing.join(', ')}`);
  return out;
}

/* -------------------------------------------------------------- lokalizacje */

/** Usuwa znaki diakrytyczne, żeby wyszukiwanie działało niezależnie od pisowni. */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase();

function parseStellariumCoord(value) {
  const m = value.match(/^([\d.]+)([NSEW])$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'S' || m[2] === 'W' ? -n : n;
}

async function buildLocations() {
  const stelFile = await ensure(SOURCES.stelLocations);
  const geoFile = await ensureUnzipped(SOURCES.geonames);

  /*
   * Stellarium jako jedyne z dostępnych źródeł podaje stopień zanieczyszczenia nieba
   * światłem w skali Bortle'a. Indeksujemy jego rekordy po zaokrąglonych współrzędnych,
   * dzięki czemu potrafimy dopasować je do wpisów GeoNames, które z kolei mają
   * poprawną pisownię nazw wraz z polskimi znakami diakrytycznymi.
   */
  const bortleGrid = new Map();
  const observatories = [];
  const stelText = await readFile(stelFile, 'utf8');
  for (const line of stelText.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 9) continue;
    const lat = parseStellariumCoord(f[5]);
    const lon = parseStellariumCoord(f[6]);
    if (lat === null || lon === null) continue;
    const bortle = parseInt(f[8], 10);
    const key = `${Math.round(lat * 5)}:${Math.round(lon * 5)}`;
    if (Number.isFinite(bortle) && !bortleGrid.has(key)) bortleGrid.set(key, bortle);

    /* Obserwatoria trafiają do wyników wyszukiwania jako osobna kategoria,
     * bo dla obserwatora to najciekawsze punkty na mapie. */
    if (f[3] === 'O') {
      observatories.push({
        name: f[0],
        region: f[1] || null,
        lat,
        lon,
        elevation: parseInt(f[7], 10) || 0,
        bortle: Number.isFinite(bortle) ? bortle : null,
        tz: f[9]?.trim() || null,
        kind: 'observatory',
        population: 0,
      });
    }
  }

  const geoText = await readFile(geoFile, 'utf8');
  const cities = [];
  for (const line of geoText.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    if (f.length < 19) continue;
    const country = f[8];
    const population = parseInt(f[14], 10) || 0;
    const fcode = f[7];

    /* Zakres: cała Polska powyżej pięciu tysięcy mieszkańców oraz reszta świata
     * powyżej dwustu tysięcy. To wystarcza, żeby użytkownik z Polski znalazł swoje
     * miasto, a jednocześnie plik pozostaje mały. */
    const isPoland = country === 'PL';
    if (!isPoland && population < 200000) continue;
    /* Dzielnice dużych miast tylko zaśmiecają listę wyników. */
    if (fcode === 'PPLX') continue;
    if (isPoland && EXCLUDED_DISTRICTS.has(fold(f[2]))) continue;

    const lat = parseFloat(f[4]);
    const lon = parseFloat(f[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const asciiName = f[2];
    const name = CITY_NAMES_PL[`${country}:${asciiName}`] ?? f[1];
    const key = `${Math.round(lat * 5)}:${Math.round(lon * 5)}`;

    cities.push({
      name,
      region: country === 'PL' ? null : (COUNTRY_NAMES_PL[country] ?? country),
      country,
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      elevation: parseInt(f[16], 10) || parseInt(f[15], 10) || 0,
      bortle: bortleGrid.get(key) ?? null,
      tz: f[17] || null,
      kind: fcode === 'PPLC' ? 'capital' : 'city',
      population,
    });
  }

  /* Obserwatoria dokładamy tylko wtedy, gdy nie dublują pobliskiego miasta. */
  const cityKeys = new Set(cities.map((c) => `${Math.round(c.lat * 20)}:${Math.round(c.lon * 20)}`));
  const extraObs = observatories.filter(
    (o) => !cityKeys.has(`${Math.round(o.lat * 20)}:${Math.round(o.lon * 20)}`),
  );

  const all = [...cities, ...extraObs].map((l) => ({
    n: l.name,
    r: l.region,
    c: l.country ?? null,
    la: Number(l.lat.toFixed(4)),
    lo: Number(l.lon.toFixed(4)),
    e: l.elevation,
    b: l.bortle,
    t: l.tz,
    k: l.kind,
    p: l.population,
    /* Postać bez znaków diakrytycznych, żeby wyszukiwarka działała dla wpisu
     * "poznan" tak samo jak dla "Poznań". */
    f: fold(l.name),
  }));

  /* Sortujemy malejąco po populacji, dzięki czemu wyszukiwarka może zwracać
   * pierwsze pasujące trafienia bez dodatkowego porządkowania. */
  all.sort((a, b) => b.p - a.p);

  await writeFile(path.join(OUT, 'locations.json'), JSON.stringify(all));
  const polish = all.filter((l) => l.c === 'PL').length;
  const withBortle = all.filter((l) => l.b !== null).length;
  log(`lokalizacji: ${all.length} (Polska: ${polish}, obserwatoria: ${extraObs.length})`);
  log(`ze skalą Bortle'a: ${withBortle}`);
  log(`locations.json: ${(JSON.stringify(all).length / 1024).toFixed(0)} KB`);
  return all;
}

/* --------------------------------------------------------------------- main */

async function main() {
  console.log('\nZenit: budowa katalogu\n');
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });

  console.log('Źródła Stellarium');
  const stelData = JSON.parse(await readFile(await ensure(SOURCES.stelModern), 'utf8'));
  const po = {
    sky: parsePo(await readFile(await ensure(SOURCES.stelSkyPo), 'utf8')),
    cultures: parsePo(await readFile(await ensure(SOURCES.stelCulturesPo), 'utf8')),
  };
  log(`tłumaczenia: ${po.sky.size} wpisów nieba, ${po.cultures.size} wpisów kultur`);

  console.log('\nGwiazdy');
  const stars = await buildStars(stelData);

  console.log('\nGwiazdozbiory');
  const constellations = await buildConstellations(stelData, stars, po);
  await writeFile(path.join(OUT, 'stars-named.json'), JSON.stringify(withConstellationNames(stars.named, constellations)));

  console.log('\nGranice gwiazdozbiorów');
  await buildBoundaries(stelData);

  console.log('\nAsteryzmy');
  await buildAsterisms(stelData, stars);

  console.log('\nObiekty głębokiego nieba');
  await buildDso(constellations);

  console.log('\nLokalizacje');
  await buildLocations();

  console.log('\nGotowe.');
  if (stars.count < 8000 || stars.count > 11000) {
    console.warn(`Ostrzeżenie: nietypowa liczba gwiazd (${stars.count}), oczekiwano około 9000.`);
  }
}

/* Dopisujemy polskie nazwy gwiazdozbiorów do warstwy opisowej gwiazd dopiero
 * po zbudowaniu listy figur, bo to ona jest źródłem tych nazw. */
function withConstellationNames(named, constellations) {
  const byId = new Map(constellations.map((c) => [c.id, c]));
  return named.map((s) => {
    const con = s.con ? byId.get(s.con) : null;
    return { ...s, conPl: con?.pl ?? null, conGen: con?.genPl ?? null };
  });
}

main().catch((err) => {
  console.error('\nBłąd budowy katalogu:', err);
  process.exit(1);
});
