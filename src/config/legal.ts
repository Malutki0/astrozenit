/*
 * Dane do dokumentów prawnych.
 *
 * Wydzielone tak samo jak dane kontaktowe i z tego samego powodu: to jedyne miejsca
 * w aplikacji z treścią, której nie da się wyliczyć ani sprawdzić w kodzie. Pola puste
 * po prostu się nie pokazują, a dokument mówi wprost, czego brakuje. Wpisanie tu
 * zmyślonej nazwy firmy albo adresu byłoby gorsze niż luka, bo dokument prawny, który
 * kłamie w punkcie o tożsamości administratora, jest bezwartościowy.
 */

export interface LegalInfo {
  /** Kto odpowiada za dane. Osoba fizyczna albo podmiot, zależnie od tego, jak to zostanie ułożone. */
  administrator: string;
  /** Adres do korespondencji. Wymagany przy przetwarzaniu danych osobowych. */
  address: string;
  /** Adres poczty do spraw danych osobowych. */
  contactEmail: string;
  /** Data, od której obowiązuje bieżąca wersja dokumentów. */
  effectiveFrom: string;
  /*
   * Wersja dokumentów.
   *
   * Zapisujemy ją razem ze zgodą użytkownika. Bez numeru wersji zgoda znaczy tylko
   * "kiedyś się zgodził", a nie "zgodził się na to, co wtedy pisało", i przy każdej
   * zmianie regulaminu nie dałoby się ustalić, kto na co przystał.
   */
  version: string;
  /** Dostawca hostingu, jeżeli już wybrany. Podmiot przetwarzający dane na nasze zlecenie. */
  hosting: string;
}

export const LEGAL: LegalInfo = {
  administrator: 'Piotr Banach',
  /*
   * Adres do korespondencji nadal pusty i to jest brak, a nie przeoczenie.
   *
   * Przepisy o ochronie danych wymagają, żeby administrator podał dane kontaktowe
   * pozwalające się z nim skontaktować, i sam adres poczty bywa uznawany za za mało
   * przy sporze albo przy skardze do urzędu. Dopóki tu nic nie stoi, dokument pomija
   * to zdanie zamiast pisać nazwisko z pustym przecinkiem po nim.
   */
  address: '',
  contactEmail: 'kontakt@astrozenit.pl',
  effectiveFrom: '2 września 2026',
  version: '1.0',
  hosting: '',
};

/** Czy dokument da się przedstawić jako obowiązujący, czy jako projekt do uzupełnienia. */
export const legalReady = Boolean(LEGAL.administrator && LEGAL.contactEmail && LEGAL.effectiveFrom);

/*
 * Odbiorcy danych, czyli podmioty, do których trafia cokolwiek z tej aplikacji.
 *
 * Lista jest wyliczona z kodu, a nie napisana z pamięci: każda pozycja odpowiada
 * miejscu, w którym aplikacja naprawdę wychodzi na zewnątrz. Jeżeli dojdzie kolejne
 * połączenie, ta lista musi urosnąć razem z nim.
 */
export const RECIPIENTS = [
  {
    name: 'Open-Meteo',
    purpose: 'prognoza pogody i zachmurzenia',
    data: 'współrzędne zaokrąglone do około kilometra, bez identyfikatora użytkownika',
    url: 'https://open-meteo.com/en/terms',
  },
  {
    name: 'OpenStreetMap',
    purpose: 'kafelki mapy w sekcji Chmury',
    data: 'adres IP i numer oglądanego kafelka, przekazywane przez samą przeglądarkę',
    url: 'https://wiki.osmfoundation.org/wiki/Privacy_Policy',
  },
  {
    name: 'NASA',
    purpose: 'zdjęcia dołączone do aktualności',
    data: 'adres IP, przekazywany przez przeglądarkę przy pobieraniu obrazu',
    url: 'https://www.nasa.gov/privacy/',
  },
  {
    name: 'Celestrak',
    purpose: 'dane orbitalne satelitów',
    data: 'adres IP, przekazywany przez przeglądarkę przy pobieraniu pliku',
    url: 'https://celestrak.org/',
  },
] as const;
