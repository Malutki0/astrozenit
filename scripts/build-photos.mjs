/*
 * Pobiera zdjęcia obiektów nieba razem z informacją o licencji i autorze.
 *
 * DLACZEGO TAK, A NIE PROŚCIEJ
 *
 * Zdjęcia astronomiczne w sieci prawie nigdy nie są wolne od praw autorskich, a te
 * wolne bywają błędnie opisane. Dlatego nie pobieramy niczego "z internetu", tylko
 * wyłącznie z Wikimedia Commons, bo jest to jedyne duże źródło, które podaje licencję
 * i autora w postaci nadającej się do odczytu przez program. Każdy plik przechodzi
 * kontrolę licencji, a te, których nie da się użyć, są pomijane z podaniem powodu.
 *
 * Obiekt na zdjęciu też musi się zgadzać. Wyszukiwarka Commons tego nie gwarantuje:
 * przy zapytaniu o Messier 31 zwracała zdjęcie galaktyki M82. Dlatego bierzemy zdjęcie
 * wiodące artykułu w Wikipedii, czyli to, które redaktorzy wybrali jako przedstawiające
 * dany obiekt. Sprawdzone na kilkunastu przypadkach: obiekt zgadza się za każdym razem.
 *
 * Tempo zapytań jest ograniczone do jednego na sekundę, zgodnie z zasadami Wikimedia
 * dla programów bez konta. Bez tego serwer odpowiada odmową już po kilkunastu żądaniach.
 *
 * Uruchomienie: npm run build:photos
 * Skrypt można przerwać i uruchomić ponownie, pobiera tylko brakujące pliki.
 */

import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const uruchom = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'photos');
const MANIFEST = path.join(ROOT, 'public', 'data', 'photos.json');

const WIKI = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/*
 * Nagłówek przedstawiający program. Wikimedia wymaga, żeby dało się ustalić,
 * kto wysyła zapytania, i odmawia obsługi żądaniom bez tej informacji.
 */
const HEADERS = {
  'User-Agent': 'AstroZenit/1.0 (projekt studencki, https://piotrbanach.site/)',
};

/** Szerokość pobieranych zdjęć. Wystarcza na panel przy podwójnej gęstości pikseli. */
const WIDTH = 640;

/* Licencje, które wolno wykorzystać z podaniem autora. Wszystko inne odrzucamy. */
const DOZWOLONE = /^(CC0|CC BY|CC BY-SA|Public domain|PD|No restrictions)/i;

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/* Odstęp między zapytaniami. Wikimedia prosi o nie więcej niż jedno na sekundę. */
let ostatnieZapytanie = 0;
async function pobierz(url, jakoTekst = true) {
  const teraz = Date.now();
  const odczekaj = Math.max(0, 1100 - (teraz - ostatnieZapytanie));
  if (odczekaj > 0) await czekaj(odczekaj);
  ostatnieZapytanie = Date.now();

  const odpowiedz = await fetch(url, { headers: HEADERS });
  if (!odpowiedz.ok) throw new Error(`kod ${odpowiedz.status}`);
  return jakoTekst ? odpowiedz.json() : Buffer.from(await odpowiedz.arrayBuffer());
}

/** Zdjęcie wiodące artykułu, czyli to wybrane przez redaktorów jako przedstawiające obiekt. */
async function zdjecieWiodace(tytul) {
  const url = `${WIKI}?action=query&titles=${encodeURIComponent(tytul)}&prop=pageimages&piprop=name&format=json&redirects=1`;
  const dane = await pobierz(url);
  const strona = Object.values(dane.query?.pages ?? {})[0];
  return strona?.pageimage ? `File:${strona.pageimage}` : null;
}

/** Adres pomniejszonego pliku razem z licencją i autorem. */
async function opisPliku(plik) {
  const url =
    `${COMMONS}?action=query&titles=${encodeURIComponent(plik)}` +
    `&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=${WIDTH}&format=json`;
  const dane = await pobierz(url);
  const info = Object.values(dane.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info?.thumburl) return null;

  const meta = info.extmetadata ?? {};
  const czysc = (v) =>
    (v?.value ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return {
    url: info.thumburl,
    mime: info.thumbmime ?? info.mime ?? 'image/jpeg',
    licencja: czysc(meta.LicenseShortName) || 'nieznana',
    autor: czysc(meta.Artist).slice(0, 90) || 'nieznany',
    plik,
  };
}

/*
 * Lista obiektów. Klucz musi odpowiadać identyfikatorowi w katalogu aplikacji,
 * a tytuł nazwie artykułu w angielskiej Wikipedii.
 */
async function listaObiektow() {
  const dso = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'dso.json'), 'utf8'));
  const pozycje = [];

  /* Obiekty Messiera. Numer katalogowy jednoznacznie wskazuje artykuł. */
  for (const obiekt of dso) {
    const numer = /^M\s*(\d+)$/i.exec(obiekt.id ?? '');
    if (!numer) continue;
    pozycje.push({ klucz: `dso:${obiekt.id}`, tytul: `Messier ${numer[1]}` });
  }

  /*
   * Gwiazd świadomie nie pobieramy.
   *
   * Pierwsza wersja skryptu brała je razem z resztą i wynik był bezużyteczny.
   * Nawet największe teleskopy widzą gwiazdę inną niż Słońce jako punkt, więc
   * artykuły o gwiazdach ilustruje się mapą gwiazdozbioru z zaznaczoną pozycją.
   * Sprawdzone: dla Syriusza, Arktura, Wegi, Kapelli i Rigela zdjęciem wiodącym
   * była mapa gwiazdozbioru, a nie fotografia. W miniaturze o boku czterdziestu
   * pikseli taka mapa to czarny kwadrat, czyli coś gorszego niż ikona gwiazdy,
   * bo zajmuje miejsce i nic nie mówi.
   *
   * Odróżnienie mapy od fotografii nie da się zrobić programowo w sposób pewny,
   * a ręczna lista wyjątków dla kilkunastu gwiazd nie jest warta swojej ceny:
   * fotografia gwiazdy i tak pokazywałaby punkt.
   */

  /*
   * Zdjęcia scen, a nie pojedynczych obiektów.
   *
   * Rysunki w kartach kalendarza są wierne tam, gdzie da się je policzyć: faza
   * Księżyca na daną datę jest rysowana z rzeczywistego terminatora, a tarcze planet
   * z map ich powierzchni. Fotografia byłaby w tych miejscach gorsza, bo pokazywałaby
   * fazę z dnia zdjęcia zamiast z dnia wydarzenia.
   *
   * Są jednak zjawiska, których nie da się narysować wiernie, bo ich wyglądu nie
   * wyznacza żadna dająca się policzyć wielkość: rój meteorów, zaćmienie w całości
   * i Droga Mleczna. Tam zdjęcie mówi więcej niż jakikolwiek symbol.
   */
  const sceny = [
    ['scene:meteor-shower', 'Perseids'],
    ['scene:lunar-eclipse', 'Lunar eclipse'],
    ['scene:solar-eclipse', 'Solar eclipse'],
    ['scene:milky-way', 'Milky Way'],
    ['scene:aurora', 'Aurora'],
    ['scene:zodiacal-light', 'Zodiacal light'],
    ['scene:moon', 'Moon'],
    /*
     * Zdjęcie wiodące artykułu o Układzie Słonecznym jest schematem z podpisami
     * i strzałkami, więc jako tło sekcji wygląda jak wyrwana kartka z podręcznika.
     * Jowisz z Wielką Czerwoną Plamą to fotografia z sondy, bez ani jednego napisu,
     * i od razu mówi, o czym jest ta sekcja.
     */
    ['scene:planets', 'Jupiter'],
    ['scene:satellites', 'International Space Station'],
    ['scene:constellations', 'Star trail'],
    ['scene:calendar', 'Night sky'],
    ['scene:clouds', 'Noctilucent cloud'],
  ];
  for (const [klucz, tytul] of sceny) pozycje.push({ klucz, tytul });

  return pozycje;
}

/*
 * Zmniejszenie pobranych plików.
 *
 * Commons oddaje miniatury w swoich standardowych szerokościach, a nie w żądanej,
 * więc dostajemy 960 pikseli zamiast 640. Gorzej z formatem: pliki PNG ważą po
 * ponad megabajcie, bo PNG kompresuje bezstratnie, co przy fotografii nie ma sensu.
 *
 * Krok pierwszy używa narzędzia sips wbudowanego w macOS: skalowanie i zamiana
 * na JPEG. Przezroczystość ginie, ale tło zdjęć astronomicznych i tak jest czarne.
 *
 * Krok drugi zamienia JPEG na WebP, o ile w systemie jest cwebp. Zdjęcia
 * astronomiczne są dla JPEG najgorszym możliwym materiałem: gromada kulista to
 * kilkanaście tysięcy jasnych punktów na czarnym tle, czyli dokładnie ten rodzaj
 * szczegółu, który JPEG odtwarza kosztem ogromnej liczby bajtów. Pomiar na tym
 * zbiorze: mgławica Oriona 76 kB w JPEG i 24 kB w WebP, Galaktyka Andromedy
 * 88 kB i 44 kB. WebP działa we wszystkich przeglądarkach od roku 2020.
 *
 * Brak cwebp nie jest błędem, tylko gorszym wynikiem: zostają pliki JPEG, które
 * wyglądają tak samo, ale ważą dwa do trzech razy więcej. Dzięki temu skrypt
 * działa na maszynie bez dodatkowych narzędzi.
 *
 * Cały krok jest powtarzalny: plik już przetworzony jest pomijany, więc ponowne
 * uruchomienie niczego nie psuje ani nie traci na jakości przez wielokrotne kodowanie.
 */
const DOCELOWA_SZEROKOSC = 640;
const JAKOSC_JPEG = 72;
const JAKOSC_WEBP = 72;

async function maCwebp() {
  try {
    await uruchom('cwebp', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function zmniejsz(manifest) {
  const webp = await maCwebp();
  if (!webp) {
    console.log('Brak narzędzia cwebp, zostają pliki JPEG. Instalacja: brew install webp');
  }

  let przed = 0;
  let po = 0;
  let zmienione = 0;

  for (const [klucz, wpis] of Object.entries(manifest)) {
    const sciezka = path.join(OUT_DIR, wpis.plik);
    if (!(await istnieje(sciezka))) continue;

    const rozmiarPrzed = (await stat(sciezka)).size;
    przed += rozmiarPrzed;

    /* Plik już w docelowym formacie i rozmiarze zostawiamy w spokoju. */
    if (wpis.plik.endsWith('.webp') || (!webp && wpis.plik.endsWith('.jpg'))) {
      const { stdout } = await uruchom('sips', ['-g', 'pixelWidth', sciezka]);
      if (Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1] ?? 0) <= DOCELOWA_SZEROKOSC) {
        po += rozmiarPrzed;
        continue;
      }
    }

    /* Krok pierwszy: skalowanie i JPEG. */
    const posredni = path.join(OUT_DIR, `${klucz.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.tmp.jpg`);
    await uruchom('sips', [
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(JAKOSC_JPEG),
      '-Z', String(DOCELOWA_SZEROKOSC),
      sciezka,
      '--out', posredni,
    ]);

    /* Krok drugi: WebP, jeśli jest czym. */
    const nazwa = wpis.plik.replace(/\.(png|jpg|webp)$/, webp ? '.webp' : '.jpg');
    const wynik = path.join(OUT_DIR, nazwa);

    if (webp) {
      await uruchom('cwebp', ['-q', String(JAKOSC_WEBP), '-quiet', posredni, '-o', wynik]);
      await unlink(posredni);
    } else {
      await uruchom('mv', [posredni, wynik]);
    }

    if (nazwa !== wpis.plik) {
      await unlink(sciezka).catch(() => {});
      manifest[klucz] = { ...wpis, plik: nazwa };
    }

    po += (await stat(wynik)).size;
    zmienione++;
  }

  console.log(
    `Przetworzono ${zmienione} plikow: ${(przed / 1048576).toFixed(1)} MB do ${(po / 1048576).toFixed(1)} MB.`,
  );
}

async function istnieje(sciezka) {
  try {
    await stat(sciezka);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let manifest = {};
  if (await istnieje(MANIFEST)) {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  }

  const pozycje = await listaObiektow();
  console.log(`Do pobrania: ${pozycje.length} obiektów. Tempo jedno zapytanie na sekundę.\n`);

  let pobrane = 0;
  let pominiete = 0;
  let bledy = 0;
  let bajty = 0;

  for (const [i, pozycja] of pozycje.entries()) {
    const nazwaPliku = pozycja.klucz.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    if (manifest[pozycja.klucz]) {
      const sciezka = path.join(OUT_DIR, manifest[pozycja.klucz].plik);
      if (await istnieje(sciezka)) {
        pominiete++;
        continue;
      }
    }

    const postep = `[${String(i + 1).padStart(3)}/${pozycje.length}]`;
    try {
      const plik = await zdjecieWiodace(pozycja.tytul);
      if (!plik) {
        console.log(`${postep} ${pozycja.tytul}: brak zdjęcia w artykule`);
        pominiete++;
        continue;
      }

      const opis = await opisPliku(plik);
      if (!opis) {
        console.log(`${postep} ${pozycja.tytul}: brak opisu pliku`);
        pominiete++;
        continue;
      }

      if (!DOZWOLONE.test(opis.licencja)) {
        console.log(`${postep} ${pozycja.tytul}: licencja "${opis.licencja}" nie pozwala na użycie`);
        pominiete++;
        continue;
      }

      const rozszerzenie = opis.mime.includes('png') ? 'png' : 'jpg';
      const nazwa = `${nazwaPliku}.${rozszerzenie}`;
      const dane = await pobierz(opis.url, false);
      await writeFile(path.join(OUT_DIR, nazwa), dane);

      manifest[pozycja.klucz] = {
        plik: nazwa,
        licencja: opis.licencja,
        autor: opis.autor,
        zrodlo: `https://commons.wikimedia.org/wiki/${encodeURIComponent(opis.plik)}`,
      };
      bajty += dane.length;
      pobrane++;
      console.log(
        `${postep} ${pozycja.tytul.padEnd(22)} ${opis.licencja.padEnd(14)} ${Math.round(dane.length / 1024)} KB`,
      );
    } catch (blad) {
      bledy++;
      console.log(`${postep} ${pozycja.tytul}: ${blad.message}`);
    }

    /* Zapisujemy na bieżąco, żeby przerwanie skryptu nie zmarnowało dotychczasowej pracy. */
    if (pobrane % 10 === 0) await writeFile(MANIFEST, JSON.stringify(manifest), 'utf8');
  }

  console.log(
    `\nPobrano ${pobrane}, pominięto ${pominiete}, błędów ${bledy}. Razem ${(bajty / 1048576).toFixed(1)} MB.`,
  );

  await zmniejsz(manifest);
  await writeFile(MANIFEST, JSON.stringify(manifest), 'utf8');
}

await main();
