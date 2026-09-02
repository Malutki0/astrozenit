/*
 * Kontrola poprawności warstwy astronomicznej.
 * Porównuje wyniki silnika z wartościami referencyjnymi dla Poznania.
 * Uruchomienie: npm run verify:astro
 */
import {
  Body, Observer, Equator, Horizon, Illumination, SearchRiseSet, SearchHourAngle,
  SearchAltitude, MoonPhase, Libration, SearchMoonQuarter, Seasons, Constellation,
  DefineStar, SearchLunarEclipse, SearchMaxElongation, Elongation,
} from 'astronomy-engine';

const obs = new Observer(52.4064, 16.9252, 60);
const fmt = (d) => (d ? d.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }) : 'brak');
const ok = [];
const fail = [];
const check = (label, value, expect, tol) => {
  const good = Math.abs(value - expect) <= tol;
  (good ? ok : fail).push(`${good ? 'OK  ' : 'BŁĄD'} ${label}: ${value.toFixed(3)} (oczekiwano ${expect} +/- ${tol})`);
};

console.log('\nZenit: kontrola warstwy astronomicznej');
console.log('Obserwator: Poznań 52.4064 N, 16.9252 E, 60 m\n');

/* 1. Przesilenie letnie 2026: 21 czerwca, około 10:25 czasu polskiego. */
const s = Seasons(2026);
console.log('Równonoce i przesilenia 2026');
console.log('  równonoc wiosenna: ', fmt(s.mar_equinox.date));
console.log('  przesilenie letnie:', fmt(s.jun_solstice.date));
console.log('  równonoc jesienna: ', fmt(s.sep_equinox.date));
console.log('  przesilenie zimowe:', fmt(s.dec_solstice.date));
check('przesilenie letnie, dzień czerwca', s.jun_solstice.date.getUTCDate(), 21, 0);

/* 2. Wschód i zachód Słońca w Poznaniu w dniu przesilenia letniego.
      Wartości wyprowadzone analitycznie, nie z pamięci:
        kąt godzinny H dla h = -0.833 przy phi = 52.4064 i delta = 23.44 daje dzień 16.81 h,
        południe słoneczne w Poznaniu latem wypada o 12.87 czasu lokalnego,
        stąd wschód 4.47 i zachód 21.28. Silnik dokłada równanie czasu, więc tolerancja 0.1 h. */
const solsticeDay = new Date(Date.UTC(2026, 5, 21, 0, 0, 0));
const sr = SearchRiseSet(Body.Sun, obs, +1, solsticeDay, 1);
const ss = SearchRiseSet(Body.Sun, obs, -1, solsticeDay, 1);
const localHour = (d) => {
  const p = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === 'hour').value) + Number(p.find((x) => x.type === 'minute').value) / 60;
};
console.log('\nSłońce 21 czerwca 2026');
console.log('  wschód:', fmt(sr.date), '| zachód:', fmt(ss.date));
check('wschód Słońca, godzina lokalna', localHour(sr.date), 4.47, 0.1);
check('zachód Słońca, godzina lokalna', localHour(ss.date), 21.28, 0.1);

/* 3. Górowanie Słońca w przesilenie: wysokość = 90 - szerokość + nachylenie osi. */
const transit = SearchHourAngle(Body.Sun, obs, 0, solsticeDay, +1);
check('wysokość Słońca w górowaniu', transit.hor.altitude, 90 - 52.4064 + 23.44, 0.2);

/* 4. Zmierzch astronomiczny w Poznaniu w czerwcu nie zapada. */
const duskJune = SearchAltitude(Body.Sun, obs, -1, solsticeDay, 1, -18);
console.log('\nZmierzch astronomiczny 21 czerwca:', duskJune ? fmt(duskJune.date) : 'nie zapada (noc biała)');
if (duskJune !== null) fail.push('BŁĄD noc astronomiczna nie powinna zapadać w Poznaniu 21 czerwca');
else ok.push('OK   brak nocy astronomicznej w czerwcu, zgodnie z oczekiwaniem');

/* 5. W grudniu zmierzch astronomiczny musi zapaść.
      Wyprowadzenie: cos(H) = (sin(-18) - sin(phi) sin(delta)) / (cos(phi) cos(delta))
      dla phi = 52.4064 i delta = -23.44 daje H = 89.37 stopnia, czyli 5.96 h.
      Noc astronomiczna trwa więc 24 - 2 * 5.96 = 12.08 h. */
const decDay = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
const duskDec = SearchAltitude(Body.Sun, obs, -1, decDay, 1, -18);
const dawnDec = SearchAltitude(Body.Sun, obs, +1, decDay, 2, -18);
const darkH = (dawnDec.date - duskDec.date) / 3600000;
console.log('Noc astronomiczna 21 grudnia:', fmt(duskDec.date), '->', fmt(dawnDec.date), `(${darkH.toFixed(1)} h)`);
check('długość nocy astronomicznej w grudniu (h)', darkH, 12.08, 0.3);

/* 6. Faza Księżyca i jej zgodność z kwadrami. */
const now = new Date(Date.UTC(2026, 7, 31, 20, 0, 0));
const phase = MoonPhase(now);
const illum = Illumination(Body.Moon, now);
const lib = Libration(now);
console.log('\nKsiężyc 31 sierpnia 2026, 22:00 czasu polskiego');
console.log('  faza:', phase.toFixed(1), 'stopnia | oświetlenie:', (illum.phase_fraction * 100).toFixed(1), '%');
console.log('  odległość:', lib.dist_km.toFixed(0), 'km | średnica:', (lib.diam_deg * 60).toFixed(1), 'minuty łuku');
const expectedIllum = (1 - Math.cos((phase * Math.PI) / 180)) / 2;
check('oświetlenie zgodne z fazą', illum.phase_fraction, expectedIllum, 0.03);
check('odległość Księżyca w zakresie perygeum i apogeum', lib.dist_km, 384400, 30000);

let mq = SearchMoonQuarter(now);
console.log('  najbliższe kwadry:');
const qn = ['nów', 'pierwsza kwadra', 'pełnia', 'ostatnia kwadra'];
for (let i = 0; i < 4; i++) {
  console.log('   ', qn[mq.quarter].padEnd(16), fmt(mq.time.date));
  const { NextMoonQuarter } = await import('astronomy-engine');
  mq = NextMoonQuarter(mq);
}

/* 7. Gwiazdozbiory dla znanych współrzędnych. */
console.log('\nPrzynależność do gwiazdozbiorów');
const conTests = [
  ['Wega', 18.61565, 38.78369, 'Lyr'],
  ['Betelgeza', 5.91953, 7.407, 'Ori'],
  ['Syriusz', 6.75248, -16.71612, 'CMa'],
  ['Gwiazda Polarna', 2.53030, 89.26411, 'UMi'],
];
for (const [name, ra, dec, expect] of conTests) {
  const c = Constellation(ra, dec);
  const good = c.symbol === expect;
  (good ? ok : fail).push(`${good ? 'OK  ' : 'BŁĄD'} gwiazdozbiór ${name}: ${c.symbol} (oczekiwano ${expect})`);
  console.log(' ', name.padEnd(16), c.symbol, c.name);
}

/* 8. Wschód i zachód gwiazdy przez DefineStar. Wega w Poznaniu jest okołobiegunowa? Nie,
      deklinacja 38.8 przy szerokości 52.4 daje |dec| > 90 - lat = 37.6, więc jest okołobiegunowa. */
DefineStar(Body.Star1, 18.61565, 38.78369, 25);
const vRise = SearchRiseSet(Body.Star1, obs, +1, now, 1);
const vSet = SearchRiseSet(Body.Star1, obs, -1, now, 1);
const vTransit = SearchHourAngle(Body.Star1, obs, 0, now, +1);
console.log('\nWega z Poznania');
console.log('  wschód:', fmt(vRise?.date), '| zachód:', fmt(vSet?.date));
console.log('  górowanie:', fmt(vTransit.time.date), 'na wysokości', vTransit.hor.altitude.toFixed(1), 'stopnia');
if (vRise === null && vSet === null) ok.push('OK   Wega okołobiegunowa z Poznania, zgodnie z oczekiwaniem');
else fail.push('BŁĄD Wega powinna być okołobiegunowa przy szerokości 52.4 N');
check('wysokość Wegi w górowaniu', vTransit.hor.altitude, 90 - 52.4064 + 38.78, 0.6);

/* 9. Planety: pozycja i jasność. */
console.log('\nPlanety 31 sierpnia 2026, 22:00 czasu polskiego');
for (const [key, body] of [['Merkury', Body.Mercury], ['Wenus', Body.Venus], ['Mars', Body.Mars], ['Jowisz', Body.Jupiter], ['Saturn', Body.Saturn]]) {
  const eq = Equator(body, now, obs, true, true);
  const hor = Horizon(now, obs, eq.ra, eq.dec, 'normal');
  const il = Illumination(body, now);
  const el = Elongation(body, now);
  console.log(
    ` ${key.padEnd(8)} wys ${hor.altitude.toFixed(1).padStart(6)} | az ${hor.azimuth.toFixed(1).padStart(6)} | mag ${il.mag.toFixed(2).padStart(6)} | elong ${el.elongation.toFixed(1).padStart(5)} | ${Constellation(Equator(body, now, obs, false, true).ra, Equator(body, now, obs, false, true).dec).symbol}`,
  );
}
const venusEl = SearchMaxElongation(Body.Venus, now);
console.log('  najbliższa maksymalna elongacja Wenus:', fmt(venusEl.time.date), venusEl.elongation.toFixed(1), 'stopnia,', venusEl.visibility === 'evening' ? 'wieczorna' : 'poranna');
check('maksymalna elongacja Wenus mieści się w zakresie', venusEl.elongation, 46, 3);

/* 10. Zaćmienie Księżyca. */
const ecl = SearchLunarEclipse(now);
console.log('\nNajbliższe zaćmienie Księżyca:', fmt(ecl.peak.date), '| rodzaj:', ecl.kind, '| zakrycie:', (ecl.obscuration * 100).toFixed(0), '%');

console.log('\nWynik');
for (const line of ok) console.log(' ', line);
for (const line of fail) console.log(' ', line);
console.log(`\n${ok.length} przeszło, ${fail.length} nie przeszło.\n`);
process.exit(fail.length ? 1 : 0);
