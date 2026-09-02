/*
 * Kontrola oceny warunków obserwacyjnych i rachunku satelitów.
 *
 * Oddzielona od verify-astro.mjs, bo sprawdza kod aplikacji napisany w TypeScripcie,
 * a nie samą bibliotekę efemeryd. Uruchamiana przez scripts/run-ts.mjs.
 *
 * Sprawdzane są przede wszystkim przypadki, w których poprzednia wersja oceny kłamała:
 * planeta w środku dnia dostawała ocenę doskonałą, a obiekt poniżej progu widoczności
 * dostawał ocenę dobrą razem z uzasadnieniem mówiącym, że jest za słaby.
 */

import { Observer } from 'astronomy-engine';
import { readFileSync } from 'node:fs';

import { rateVisibility, cloudFactor, twilightLimitingMagnitude } from '../src/lib/astro/visibility';
import { parseTle } from '../src/lib/satellites/catalog';
import { fixFor } from '../src/lib/satellites/propagate';
import { findPasses } from '../src/lib/satellites/passes';

const ok: string[] = [];
const fail: string[] = [];

function check(name: string, value: number, expected: number, tolerance: number) {
  const good = Math.abs(value - expected) <= tolerance;
  (good ? ok : fail).push(
    `${good ? 'OK  ' : 'BŁĄD'} ${name}: ${value.toFixed(3)} (oczekiwano ${expected} +/- ${tolerance})`,
  );
}

function checkTrue(name: string, value: boolean) {
  (value ? ok : fail).push(`${value ? 'OK  ' : 'BŁĄD'} ${name}`);
}

const base = {
  moonSeparation: 120,
  moonIllumination: 0.2,
  moonUp: false,
  limitMag: 6.8,
};

console.log('Ocena warunków obserwacyjnych\n');

/* 1. Zgłoszony błąd: jasna planeta w środku dnia. */
const jowiszDzien = rateVisibility({
  ...base, altitude: 35, magnitude: -2.3, phase: 'day', sunAltitude: 25, cloudCover: 0,
});
console.log(`  Jowisz w dzień, 35 stopni nad horyzontem: ${jowiszDzien.score}, ${jowiszDzien.grade}`);
checkTrue('jasna planeta w dzień nie jest oceniana jako widoczna', jowiszDzien.score < 12);
checkTrue('uzasadnienie wskazuje na jasne niebo', /dzień|jasne/.test(jowiszDzien.reason));

/* 2. Ta sama planeta w nocy przy czystym niebie. */
const jowiszNoc = rateVisibility({
  ...base, altitude: 35, magnitude: -2.3, phase: 'night', sunAltitude: -30, cloudCover: 0,
});
console.log(`  Jowisz w nocy przy czystym niebie:        ${jowiszNoc.score}, ${jowiszNoc.grade}`);
check('ocena Jowisza w nocy', jowiszNoc.score, 93, 6);

/* 3. Pełne zachmurzenie musi zerować ocenę niezależnie od reszty. */
const podChmurami = rateVisibility({
  ...base, altitude: 60, magnitude: -4, phase: 'night', sunAltitude: -30, cloudCover: 100,
});
checkTrue('pełne zachmurzenie daje ocenę zero', podChmurami.score === 0);

/* 4. Mgła. */
const wMgle = rateVisibility({
  ...base, altitude: 60, magnitude: -4, phase: 'night', sunAltitude: -30, cloudCover: 0,
  horizontalVisibility: 600,
});
checkTrue('mgła poniżej kilometra daje ocenę zero', wMgle.score === 0);

/* 5. Obiekt poniżej progu widoczności nie może dostać dobrej oceny. */
const zaSlaby = rateVisibility({
  ...base, limitMag: 4.2, altitude: 60, magnitude: 6.5, phase: 'night', sunAltitude: -30, cloudCover: 0,
});
console.log(`  Gwiazda 6.5 mag na niebie miejskim:      ${zaSlaby.score}, ${zaSlaby.grade}`);
checkTrue('obiekt poniżej progu widoczności ma niską ocenę', zaSlaby.score < 20);
checkTrue('ocena i uzasadnienie nie przeczą sobie', zaSlaby.score < 20 && /słaby/.test(zaSlaby.reason));

/* 6. Ocena musi rosnąć monotonicznie wraz z zapadaniem zmierzchu. */
let poprzednia = -1;
let rosnie = true;
for (const alt of [0, -3, -6, -9, -12, -15, -18]) {
  const w = rateVisibility({
    ...base, altitude: 50, magnitude: 1,
    phase: alt > -0.8 ? 'day' : alt > -6 ? 'civil' : alt > -12 ? 'nautical' : 'astronomical',
    sunAltitude: alt, cloudCover: 0,
  });
  if (w.score < poprzednia) rosnie = false;
  poprzednia = w.score;
}
checkTrue('ocena rośnie monotonicznie wraz ze zmierzchem', rosnie);

/* 7. Próg widoczności w dzień odpowiada temu, co realnie widać. */
check('próg widoczności przy Słońcu w zenicie', twilightLimitingMagnitude(60), -4.6, 0.1);
check('próg widoczności o zmierzchu cywilnym', twilightLimitingMagnitude(-6), 1.4, 0.1);
checkTrue('po zmierzchu astronomicznym próg zależy już tylko od miejsca',
  twilightLimitingMagnitude(-18) === Infinity);

/* 8. Wpływ zachmurzenia jest łagodny na początku i ostry na końcu. */
check('mnożnik przy zachmurzeniu 25 procent', cloudFactor(25), 0.82, 0.03);
check('mnożnik przy zachmurzeniu 75 procent', cloudFactor(75), 0.3, 0.04);
checkTrue('mnożnik przy pełnym zachmurzeniu wynosi zero', cloudFactor(100) === 0);

console.log('\nSatelity\n');

const dane = JSON.parse(readFileSync('public/data/satellites.json', 'utf8')) as { tle: string };
const sats = parseTle(dane.tle);
checkTrue('kopia wbudowana zawiera co najmniej sto obiektów', sats.length >= 100);

const iss = sats.find((s) => s.name.startsWith('ISS'));
checkTrue('w zestawie jest Międzynarodowa Stacja Kosmiczna', Boolean(iss));

if (iss) {
  const obs = { lat: 52.41, lon: 16.93, elevation: 80 };
  const teraz = new Date();
  const fix = fixFor(iss, teraz, obs);
  checkTrue('położenie stacji daje się policzyć', Boolean(fix));
  if (fix) {
    console.log(`  Stacja: ${fix.height.toFixed(0)} km nad Ziemią, ${fix.range.toFixed(0)} km od obserwatora`);
    /* Orbita stacji jest utrzymywana w wąskim przedziale wysokości. */
    check('wysokość orbity stacji', fix.height, 420, 60);
  }

  const przeloty = findPasses(iss, teraz, obs, new Observer(obs.lat, obs.lon, obs.elevation), {
    hours: 72, minPeakAltitude: 10, onlyVisible: false,
  });
  console.log(`  Przelotów stacji powyżej 10 stopni przez 72 h: ${przeloty.length}`);
  /* Stacja obiega Ziemię co półtorej godziny, ale nad danym punktem przelatuje
   * kilka razy na dobę i tylko część tych przelotów jest wysoka. */
  checkTrue('liczba przelotów stacji mieści się w rozsądnym zakresie',
    przeloty.length >= 5 && przeloty.length <= 40);

  const dlugosci = przeloty.map((p) => (p.end.getTime() - p.start.getTime()) / 60000);
  const najdluzszy = Math.max(...dlugosci);
  console.log(`  Najdłuższy przelot: ${najdluzszy.toFixed(1)} min`);
  /* Przelot od horyzontu do horyzontu na wysokości czterystu kilometrów
   * nie może trwać dłużej niż mniej więcej jedenaście minut. */
  checkTrue('żaden przelot nie trwa dłużej niż dwanaście minut', najdluzszy <= 12);
}

console.log('\nWynik');
for (const line of ok) console.log(' ', line);
for (const line of fail) console.log(' ', line);
console.log(`\n${ok.length} przeszło, ${fail.length} nie przeszło.\n`);
process.exit(fail.length ? 1 : 0);
