import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui';

import styles from './AppShell.module.css';

/*
 * Pasek informacyjny o przechowywaniu danych w przeglądarce.
 *
 * Nie jest to okienko zgody i celowo nim nie jest. Zgody wymaga wyłącznie przechowywanie
 * nieko­nieczne: analityka, reklama, śledzenie. AstroZenit nie ma żadnego z tych trzech.
 * Zapisuje w przeglądarce ustawienia widoku, wybrane miejsce i listę ulubionych, czyli
 * wyłącznie to, o co użytkownik sam poprosił, i to nie wyjeżdża nigdzie poza jego
 * urządzenie. Takie przechowywanie wymaga poinformowania, a nie pytania o zgodę.
 *
 * Dlatego jest tu jeden przycisk, a nie dwa. Okienko z wyborem "zgadzam się" i "odrzucam"
 * przy braku czegokolwiek do odrzucenia jest teatrem: udaje wybór, którego nie ma,
 * i uczy ludzi klikać zgody bez czytania. Gdyby kiedykolwiek doszła analityka, ten
 * komponent trzeba będzie przerobić na prawdziwy wybór z możliwością odmowy, a nie
 * dokleić do niego drugi przycisk.
 *
 * Potwierdzenie zapisujemy w tej samej pamięci, o której mowa w treści paska. Jest w tym
 * pewna ironia i jest ona nieunikniona: bez zapisu pasek wracałby przy każdym wejściu.
 */

const KLUCZ = 'zenit:informacja-o-danych';
/* Numer wersji, żeby po zmianie zasad pasek pokazał się ponownie, zamiast zniknąć
 * na zawsze przy pierwszym potwierdzeniu sprzed lat. */
const WERSJA = '1';

function juzWidziano(): boolean {
  try {
    return localStorage.getItem(KLUCZ) === WERSJA;
  } catch {
    /* Pamięć zablokowana, na przykład w oknie prywatnym. Pasek pokażemy, potwierdzenia
     * nie zapiszemy, więc wróci przy następnym wejściu. To jest właściwe zachowanie:
     * lepiej poinformować dwa razy niż ani razu. */
    return false;
  }
}

export function CookieBanner() {
  const navigate = useNavigate();
  const [widoczny, setWidoczny] = useState(false);

  /*
   * Pokazujemy dopiero po zamontowaniu, a nie od razu przy pierwszym rysowaniu.
   * Pasek wchodzący w tej samej klatce co reszta aplikacji przesuwa układ i wygląda
   * jak usterka. Krótka zwłoka sprawia, że wjeżdża na gotową stronę.
   */
  useEffect(() => {
    if (juzWidziano()) return;
    const id = window.setTimeout(() => setWidoczny(true), 900);
    return () => window.clearTimeout(id);
  }, []);

  if (!widoczny) return null;

  const zamknij = () => {
    try {
      localStorage.setItem(KLUCZ, WERSJA);
    } catch {
      /* Brak zapisu nie może zablokować zamknięcia paska. */
    }
    setWidoczny(false);
  };

  return (
    <div className={styles.cookieBar} role="region" aria-label="Informacja o danych">
      <p className={styles.cookieText}>
        AstroZenit zapisuje w Twojej przeglądarce ustawienia widoku, wybrane miejsce
        obserwacji i listę ulubionych. Te dane nie opuszczają Twojego urządzenia. Nie ma tu
        analityki, reklam ani śledzenia, więc nie mamy o co prosić Cię o zgodę.
      </p>
      <div className={styles.cookieActions}>
        <button
          type="button"
          className={styles.cookieLink}
          onClick={() => {
            zamknij();
            navigate('/prywatnosc');
          }}
        >
          Prywatność
        </button>
        <button
          type="button"
          className={styles.cookieLink}
          onClick={() => {
            zamknij();
            navigate('/regulamin');
          }}
        >
          Regulamin
        </button>
        <Button variant="primary" onClick={zamknij}>
          Rozumiem
        </Button>
      </div>
    </div>
  );
}
