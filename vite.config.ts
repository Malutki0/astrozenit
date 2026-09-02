import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath, URL } from 'node:url';

/*
 * Połączenie szyfrowane, włączane zmienną środowiskową ZENIT_HTTPS.
 *
 * Potrzebne tylko do jednej rzeczy: przeglądarki udostępniają czujnik orientacji
 * urządzenia wyłącznie w kontekście uznanym za bezpieczny, więc na zwykłym http
 * sterowanie mapą ruchem telefonu nie zadziała, i to bez żadnego komunikatu o przyczynie.
 *
 * Domyślnie wyłączone, bo certyfikat podpisany samodzielnie każe klikać przez ostrzeżenie
 * przy każdym narzędziu, które łączy się z serwerem. Do testu kompasu na telefonie:
 *
 *   npm run dev:https
 */
export default defineConfig({
  plugins: [react(), ...(process.env.ZENIT_HTTPS ? [basicSsl()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    /*
     * Nasłuch na wszystkich interfejsach, żeby dało się wejść z telefonu w tej samej sieci.
     * Bez tego Vite słucha wyłącznie na localhost i telefon dostaje odmowę połączenia.
     * Czujnik orientacji, czyli sterowanie mapą ruchem telefonu, i tak wymaga sprawdzenia
     * na prawdziwym urządzeniu, więc dostęp z sieci lokalnej jest do tego niezbędny.
     */
    host: true,
  },
  build: {
    target: 'es2022',
    cssTarget: 'safari16',
    rollupOptions: {
      output: {
        manualChunks: {
          astro: ['astronomy-engine'],
          /* Model SGP4 obsługuje wyłącznie warstwę satelitów. Osobny plik pozwala
           * przeglądarce trzymać go w pamięci podręcznej niezależnie od reszty aplikacji. */
          sgp4: ['satellite.js'],
        },
      },
    },
  },
});
