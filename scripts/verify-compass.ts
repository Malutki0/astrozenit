/*
 * Kontrola przeliczania odczytów czujnika orientacji na kierunek patrzenia.
 *
 * Liczy tym samym kodem co aplikacja, przez import z src/lib/orientation.ts. Poprzednia
 * wersja przepisywała wzór u siebie i przez to sprawdzała wyłącznie, czy dwa razy
 * popełniono tę samą pomyłkę. Tak właśnie przeszedł błąd w znaku osi pionowej.
 *
 * Oczekiwania są zapisane położeniem telefonu w ręce, a nie wynikiem wzoru, żeby dało się
 * z nimi polemizować bez czytania kodu.
 *
 * MODEL: telefon jest oknem. Trzymasz go między okiem a niebem, ekran zwrócony do siebie,
 * a widzisz to, co jest po drugiej stronie. Kierunkiem patrzenia jest tył obudowy.
 */

import { kierunekPatrzenia, wagaAzymutu } from '../src/lib/orientation';

let bledy = 0;

function sprawdz(opis: string, wynik: number, oczekiwane: number, tolerancja = 0.5) {
  const ok = Math.abs(((wynik - oczekiwane + 540) % 360) - 180) < tolerancja;
  if (!ok) bledy++;
  console.log(
    `  ${ok ? 'OK  ' : 'BŁĄD'} ${opis}: ${wynik.toFixed(1)} (oczekiwano ${oczekiwane})`,
  );
}

console.log('Oś pionowa, telefon skierowany na północ\n');
for (const [beta, wysokosc, opis] of [
  [90, 0, 'pionowo przed sobą, patrzy w horyzont'],
  [135, 45, 'uniesiony w połowie drogi do zenitu'],
  [180, 90, 'płasko, ekranem do dołu, tył w niebo'],
  [45, -45, 'opuszczony w połowie drogi do ziemi'],
  [0, -90, 'płasko, ekranem do góry, tył w ziemię'],
] as [number, number, string][]) {
  sprawdz(opis, kierunekPatrzenia(0, beta, 0).altitude, wysokosc);
}

console.log('\nOś pozioma, telefon pionowo\n');
for (const [alpha, azymut, opis] of [
  [0, 0, 'góra telefonu na północ'],
  [90, 270, 'góra telefonu na zachód'],
  [180, 180, 'góra telefonu na południe'],
  [270, 90, 'góra telefonu na wschód'],
] as [number, number, string][]) {
  sprawdz(opis, kierunekPatrzenia(alpha, 90, 0).azimuth, azymut);
}

/*
 * Kontrola, po którą to wszystko powstało.
 *
 * Unoszenie telefonu ku niebu nie może przesuwać obrazu na boki. Poprzednia wersja
 * brała azymut wprost z kąta alpha i przy unoszeniu telefonu obraz uciekał w bok,
 * mimo że nikt telefonem nie obracał.
 */
console.log('\nUnoszenie telefonu nie przesuwa obrazu w bok\n');
for (const alpha of [0, 90, 180, 270]) {
  const punkty = [90, 110, 130, 150, 170].map((beta) => kierunekPatrzenia(alpha, beta, 0));
  const azymuty = punkty.map((p) => p.azimuth);
  const rozrzut = Math.max(...azymuty) - Math.min(...azymuty);
  const rosnie = punkty.every((p, i) => i === 0 || p.altitude > punkty[i - 1].altitude);
  const ok = rozrzut < 0.5 && rosnie;
  if (!ok) bledy++;
  console.log(
    `  ${ok ? 'OK  ' : 'BŁĄD'} przy kącie obrotu ${alpha}: azymut waha się o ` +
      `${rozrzut.toFixed(2)} stopnia, wysokość rośnie: ${rosnie}`,
  );
}

console.log('\nPrzypadki brzegowe\n');
const zenit = kierunekPatrzenia(0, 180, 0);
sprawdz('zenit ma wysokość 90', zenit.altitude, 90);
const nadir = kierunekPatrzenia(0, 0, 0);
sprawdz('nadir ma wysokość -90', nadir.altitude, -90);

/* Przechylenie telefonu na bok przy patrzeniu w horyzont obraca kierunek poziomo,
 * bo tył obudowy naprawdę zaczyna wtedy celować gdzie indziej. */
const przechylony = kierunekPatrzenia(0, 90, 30);
const zmiana = Math.abs(((przechylony.azimuth + 180) % 360) - 180);
const przechylenieDziala = zmiana > 1;
if (!przechylenieDziala) bledy++;
console.log(
  `  ${przechylenieDziala ? 'OK  ' : 'BŁĄD'} przechylenie o 30 stopni zmienia azymut ` +
    `o ${zmiana.toFixed(1)} stopnia`,
);

/*
 * Zachowanie przy patrzeniu stromo w górę.
 *
 * Test odtwarza to, co widać na nagraniu z telefonu: przy unoszeniu urządzenia ku zenitowi
 * obraz przelatywał przez pół nieba, choć telefon szedł tylko w górę. Przyczyną nie był
 * błąd w rachunku, tylko to, że w zenicie azymut przestaje być określony i drgnięcie ręki
 * obraca go o dziesiątki stopni. Symulujemy więc drżenie ręki i sprawdzamy, jak bardzo
 * wpływa ono na kierunek przyjmowany przez aplikację.
 */
console.log('\nStrome patrzenie nie rozhuśtuje azymutu\n');
for (const [wysokosc, opisPolozenia] of [
  [0, 'horyzont'],
  [45, 'w połowie drogi do zenitu'],
  [70, 'stromo'],
  [85, 'prawie w zenicie'],
] as [number, string][]) {
  const waga = wagaAzymutu(wysokosc);
  /* Drżenie ręki o dwa stopnie przy tej wysokości daje taki skok azymutu. */
  const betaSrodek = wysokosc + 90;
  const a = kierunekPatrzenia(0, betaSrodek, 0).azimuth;
  const b = kierunekPatrzenia(0, betaSrodek, 2).azimuth;
  const surowySkok = Math.abs(((b - a + 540) % 360) - 180);
  const przyjetySkok = surowySkok * waga;
  const ok = przyjetySkok < 3;
  if (!ok) bledy++;
  console.log(
    `  ${ok ? 'OK  ' : 'BŁĄD'} ${opisPolozenia}: drżenie 2 stopni daje skok ` +
      `${surowySkok.toFixed(1)}, po zważeniu ${przyjetySkok.toFixed(2)} (waga ${waga.toFixed(2)})`,
  );
}

const wagi = [
  [0, 1, 'przy horyzoncie odczyt brany w całości'],
  [60, 1, 'do sześćdziesięciu stopni odczyt brany w całości'],
  [70, 0.5, 'w połowie przejścia waga w połowie'],
  [80, 0, 'od osiemdziesięciu stopni azymut zamrożony'],
  [90, 0, 'w zenicie azymut zamrożony'],
  [-85, 0, 'stromo w dół tak samo jak stromo w górę'],
] as [number, number, string][];
console.log('');
for (const [alt, oczekiwana, opis] of wagi) {
  const w = wagaAzymutu(alt);
  const ok = Math.abs(w - oczekiwana) < 0.001;
  if (!ok) bledy++;
  console.log(`  ${ok ? 'OK  ' : 'BŁĄD'} ${opis}: waga ${w.toFixed(2)} (oczekiwano ${oczekiwana})`);
}

console.log(bledy === 0 ? '\nWszystkie kontrole kompasu przeszły.' : `\nBłędów: ${bledy}`);
process.exitCode = bledy === 0 ? 0 : 1;
