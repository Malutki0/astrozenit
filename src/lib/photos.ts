/*
 * Zdjęcia obiektów nieba.
 *
 * Manifest powstaje w skrypcie scripts/build-photos.mjs i zawiera dla każdego obiektu
 * nazwę pliku, licencję, autora oraz adres strony źródłowej. Autor i licencja nie są
 * ozdobnikiem: licencje Creative Commons wymagają podania jednego i drugiego przy
 * każdym wyświetleniu, a bez tego korzystanie ze zdjęcia jest po prostu bezprawne.
 * Dlatego opis nie jest w tym module czymś opcjonalnym, tylko częścią danych zdjęcia.
 *
 * Manifest wczytujemy dopiero, gdy pierwsza sekcja poprosi o zdjęcie. Mapa nieba
 * nigdy o nie nie pyta, więc na starcie aplikacji nie pobieramy ani bajta.
 */

export interface Photo {
  /** Adres pliku gotowy do wstawienia w atrybut src. */
  src: string;
  /** Nazwa licencji, na przykład "CC BY-SA 4.0". */
  licencja: string;
  /** Autor zdjęcia, tak jak podpisał się w Wikimedia Commons. */
  autor: string;
  /** Strona opisu pliku, na wypadek gdyby ktoś chciał sprawdzić warunki licencji. */
  zrodlo: string;
}

interface Wpis {
  plik: string;
  licencja: string;
  autor: string;
  zrodlo: string;
}

let cache: Promise<Record<string, Photo>> | null = null;

export function loadPhotos(base = '/data'): Promise<Record<string, Photo>> {
  if (cache) return cache;

  cache = fetch(`${base}/photos.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Nie udało się wczytać spisu zdjęć: ${res.status}`);
      return res.json() as Promise<Record<string, Wpis>>;
    })
    .then((raw) => {
      const out: Record<string, Photo> = {};
      for (const [klucz, wpis] of Object.entries(raw)) {
        out[klucz] = {
          src: `/photos/${wpis.plik}`,
          licencja: wpis.licencja,
          autor: wpis.autor,
          zrodlo: wpis.zrodlo,
        };
      }
      return out;
    })
    /*
     * Brak manifestu nie może wywrócić sekcji. Zdjęcia są dodatkiem do treści,
     * a nie jej nośnikiem: opis obiektu, jasność i widoczność działają bez nich.
     */
    .catch(() => ({}));

  return cache;
}

/** Klucz zdjęcia obiektu głębokiego nieba, na przykład "dso:M31". */
export const kluczDso = (id: string): string => `dso:${id}`;

/** Klucz zdjęcia gwiazdy po numerze katalogu Hipparcosa. */
export const kluczGwiazdy = (hip: number): string => `star:${hip}`;
