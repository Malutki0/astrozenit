/*
 * Uruchamia plik TypeScript z katalogu src w Node, korzystając z esbuilda
 * dostarczonego razem z Vite. Potrzebne do testów dymnych warstwy astronomicznej,
 * która nie wymaga przeglądarki.
 *
 * Użycie: node scripts/run-ts.mjs scripts/tmp/events-test.ts
 */
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = process.argv[2];
if (!entry) {
  console.error('Podaj ścieżkę do pliku wejściowego.');
  process.exit(1);
}

/* Bundle powstaje wewnątrz projektu, żeby Node rozwiązał zależności z node_modules. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'node_modules', '.zenit-run');
await mkdir(dir, { recursive: true });
const outfile = path.join(dir, `run-${Date.now()}.mjs`);
try {
  await build({
    entryPoints: [entry],
    bundle: true,
    /* Ten sam alias co w konfiguracji Vite, żeby skrypty testowe mogły importować
     * moduły aplikacji dokładnie tak, jak robi to kod produkcyjny. */
    alias: { '@': path.join(root, 'src') },
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    external: ['astronomy-engine'],
    logLevel: 'warning',
  });
  await import(`file://${outfile}`);
} finally {
  await rm(outfile, { force: true });
}
