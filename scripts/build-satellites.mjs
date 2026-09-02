/*
 * Pobiera elementy orbitalne jasnych satelitów i zapisuje kopię wbudowaną w aplikację.
 *
 * Kopia jest awaryjna: w czasie działania aplikacja pyta Celestrak o świeże dane, a po tę
 * sięga dopiero, gdy nie ma sieci. Elementy orbitalne starzeją się w tempie kilku minut
 * błędu na tydzień, więc kopia ma datę i interfejs mówi wprost, ile ma dni.
 *
 * Uruchomienie: npm run build:satellites
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
];

const parts = [];
for (const url of SOURCES) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Nie udało się pobrać ${url}: kod ${response.status}`);
    process.exit(1);
  }
  const text = await response.text();
  if (!text.includes('\n1 ')) {
    console.error(`Odpowiedź z ${url} nie wygląda na zestaw elementów orbitalnych.`);
    process.exit(1);
  }
  parts.push(text.trim());
}

/* Usuwamy powtórzenia po numerze katalogowym: stacje występują w obu grupach. */
const lines = parts.join('\n').split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
const seen = new Set();
const kept = [];
for (let i = 0; i + 2 < lines.length + 1; i++) {
  const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
  if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
  const id = l1.slice(2, 7).trim();
  i += 2;
  if (seen.has(id)) continue;
  seen.add(id);
  kept.push(name, l1, l2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'data', 'satellites.json');
const payload = { fetchedAt: Date.now(), count: seen.size, tle: kept.join('\n') };
await writeFile(out, JSON.stringify(payload), 'utf8');

const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
console.log(`Zapisano ${seen.size} obiektów do public/data/satellites.json, ${kb} KB.`);
