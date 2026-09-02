/*
 * Przeliczanie odczytów czujnika orientacji na kierunek patrzenia.
 *
 * Wydzielone z hooka do osobnego pliku, żeby dało się to sprawdzić bez przeglądarki
 * i żeby kontrola w scripts/verify-compass.ts liczyła dokładnie tym samym kodem,
 * co aplikacja. Test przepisujący wzór u siebie sprawdza wyłącznie, czy dwa razy
 * popełniło się tę samą pomyłkę, i już raz mnie to kosztowało błąd w znaku osi pionowej.
 *
 * DLACZEGO NIE WYSTARCZĄ SAME KĄTY
 *
 * Pierwsza wersja brała azymut wprost z kąta alpha, a wysokość wprost z kąta beta,
 * traktując je jak dwie niezależne liczby. Nie są niezależne. Zdarzenie orientacji
 * opisuje obrót złożony, wykonywany w kolejności Z, potem X, potem Y, więc dopiero
 * wszystkie trzy kąty razem mówią, gdzie zwrócony jest telefon.
 *
 * Skutek uboczny tego uproszczenia był dobrze widoczny: przy unoszeniu telefonu ku niebu
 * mapa uciekała na boki, mimo że nikt telefonem nie obracał. Bierze się to stąd, że przy
 * kącie beta w pobliżu dziewięćdziesięciu stopni, czyli przy telefonie trzymanym pionowo,
 * a więc w położeniu używanym najczęściej, kąty alpha i gamma opisują ten sam obrót
 * i jeden przechodzi w drugi. Odczyt alpha zaczyna wtedy skakać, choć telefon stoi.
 *
 * ROZWIĄZANIE
 *
 * Składamy z trzech kątów macierz obrotu, obracamy nią wektor wskazujący tył obudowy
 * i dopiero z otrzymanego kierunku odczytujemy azymut i wysokość. Rachunek jest stabilny
 * wszędzie poza samym zenitem i nadirem, gdzie azymut z natury przestaje być określony.
 */

/** Kierunek patrzenia wyrażony w układzie związanym z Ziemią. */
export interface Kierunek {
  /** Azymut liczony od północy w stronę wschodu, w stopniach, od 0 do 360. */
  azimuth: number;
  /** Wysokość nad horyzontem w stopniach, od -90 do 90. */
  altitude: number;
}

const DEG = Math.PI / 180;

/*
 * Kierunek patrzenia z trzech kątów zdarzenia orientacji.
 *
 * Układ urządzenia: oś x w prawo wzdłuż ekranu, oś y w górę wzdłuż ekranu, oś z prostopadle
 * do ekranu, zwrócona ku patrzącemu. Kierunkiem patrzenia jest tył obudowy, czyli wektor
 * (0, 0, -1): telefon działa jak okno, przez które widać to, co jest po drugiej stronie.
 *
 * Układ świata zgodnie ze specyfikacją: oś X na wschód, oś Y na północ, oś Z w górę.
 *
 * Macierz obrotu to złożenie Rz(alpha) razy Rx(beta) razy Ry(gamma). Obracany wektor ma
 * tylko trzecią składową, więc potrzebna jest wyłącznie trzecia kolumna tej macierzy,
 * wzięta ze znakiem minus. Stąd tak krótki rachunek przy tak długim wyjaśnieniu.
 */
export function kierunekPatrzenia(alpha: number, beta: number, gamma: number): Kierunek {
  const a = alpha * DEG;
  const b = beta * DEG;
  const g = gamma * DEG;

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  /* Wschód, północ, góra. */
  const x = -(cA * sG + sA * sB * cG);
  const y = -(sA * sG - cA * sB * cG);
  const z = -(cB * cG);

  const dlugosc = Math.hypot(x, y, z) || 1;
  const altitude = Math.asin(Math.max(-1, Math.min(1, z / dlugosc))) / DEG;

  /*
   * Azymut z rzutu wektora na płaszczyznę poziomą. W zenicie i w nadirze rzut jest zerowy
   * i azymut przestaje być określony, co nie jest usterką, tylko własnością współrzędnych.
   * Zwracamy wtedy zero, a wywołujący i tak wygładza wynik przez sinus i cosinus, więc
   * pojedyncza taka klatka nie przesuwa obrazu.
   */
  const azimuth = x === 0 && y === 0 ? 0 : (((Math.atan2(x, y) / DEG) % 360) + 360) % 360;

  return { azimuth, altitude };
}

/*
 * Waga azymutu w zależności od wysokości patrzenia.
 *
 * Przy telefonie skierowanym prosto w górę azymut traci sens. Wszystkie kierunki schodzą
 * się w zenicie, więc rzut kierunku patrzenia na płaszczyznę poziomą maleje do zera,
 * a wtedy drgnięcie ręki o jeden stopień obraca obraz o kilkadziesiąt. Nie jest to usterka
 * rachunku, tylko własność współrzędnych azymutalnych: w zenicie azymut jest nieokreślony
 * tak samo, jak nieokreślona jest długość geograficzna na biegunie.
 *
 * Widać to było wprost na nagraniu: przy unoszeniu telefonu obraz przelatywał przez pół
 * nieba, od Cefeusza przez Smoka po Orła, choć telefon szedł tylko w górę.
 *
 * Rozwiązanie polega na tym, żeby przestać wierzyć azymutowi tam, gdzie przestaje on coś
 * znaczyć. Poniżej sześćdziesięciu stopni wysokości bierzemy odczyt w całości, powyżej
 * osiemdziesięciu nie bierzemy go wcale i obraz zatrzymuje kierunek, w którym stał.
 * Pomiędzy przechodzimy płynnie, żeby nie było widać progu.
 *
 * Wysokości ograniczenie nie dotyczy: ona jest dobrze określona wszędzie i ma nadążać
 * za telefonem do samego zenitu.
 */
export function wagaAzymutu(altitude: number): number {
  const stromo = Math.abs(altitude);
  if (stromo <= 60) return 1;
  if (stromo >= 80) return 0;
  return (80 - stromo) / 20;
}
