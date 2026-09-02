/*
 * Audyt znaku em dash.
 *
 * Projekt ma twardą zasadę: ten znak nie może wystąpić nigdzie, ani w interfejsie,
 * ani w treściach, ani w kodzie, ani w komentarzach, ani w dokumentacji.
 * Skrypt przechodzi po repozytorium z pominięciem zależności i artefaktów budowania.
 *
 * Uruchomienie: npm run check:dash
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.cache', '.vite']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.md', '.svg']);

const DASH = String.fromCharCode(0x2014);

const findings = [];

async function walk(dir) {
  for (const entry of await readdir(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.DS_')) continue;
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry))) continue;
    const text = await readFile(full, 'utf8');
    if (!text.includes(DASH)) continue;
    text.split('\n').forEach((line, i) => {
      if (line.includes(DASH)) {
        findings.push(`${path.relative(ROOT, full)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

await walk(ROOT);

if (findings.length === 0) {
  console.log('\nAudyt em dash: brak wystąpień. Zasada zachowana.\n');
  process.exit(0);
}

console.error(`\nAudyt em dash: znaleziono ${findings.length} wystąpień.\n`);
for (const f of findings) console.error('  ' + f);
console.error('');
process.exit(1);
