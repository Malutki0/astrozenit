import { useCallback, useEffect, useRef, useState } from 'react';

import { kierunekPatrzenia, wagaAzymutu } from '@/lib/orientation';
import { useSkyStore } from './useSkyStore';

/*
 * Sterowanie mapą ruchem telefonu.
 *
 * Pomysł jest prosty: skierować telefon w niebo i zobaczyć na ekranie to, co jest
 * naprawdę w tamtym kierunku. Wykonanie ma trzy pułapki i wszystkie trzeba obejść,
 * bo inaczej mapa albo się nie zsynchronizuje, albo będzie drgać.
 *
 * 1. Skąd wiadomo, gdzie jest północ.
 *    Na urządzeniach Apple przeglądarka podaje gotowy kurs magnetyczny w polu
 *    webkitCompassHeading, liczony względem północy magnetycznej. Na Androidzie
 *    tego pola nie ma i trzeba użyć zdarzenia bezwzględnego, w którym kąt alpha
 *    jest liczony od północy, ale w przeciwnym kierunku. Obsługujemy oba przypadki.
 *
 * 2. Zgoda użytkownika.
 *    Od trzynastej wersji systemu Apple dostęp do czujników wymaga zgody, a o zgodę
 *    wolno zapytać wyłącznie w odpowiedzi na dotknięcie ekranu. Dlatego jest przycisk,
 *    a nie samoczynne włączanie po wejściu na stronę.
 *
 * 3. Drganie odczytu.
 *    Surowe wskazania czujnika skaczą o kilka stopni kilkadziesiąt razy na sekundę.
 *    Wygładzamy je filtrem wykładniczym, licząc średnią po sinusie i cosinusie kąta,
 *    a nie po samym kącie: inaczej przy przejściu przez północ, czyli przez granicę
 *    360 i 0 stopni, mapa obracałaby się o pełny obrót w drugą stronę.
 */

export type OrientationStatus =
  | 'unsupported'
  | 'insecure'
  | 'idle'
  | 'asking'
  | 'denied'
  | 'active'
  /* Czujnik działa, ale nie zna północy. Mapa obraca się razem z telefonem,
   * tylko kierunek trzeba raz ustawić ręcznie. */
  | 'relative'
  | 'no-compass';

interface DeviceOrientationEventWithPermission extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

type PermissionCapable = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/** Współczynnik wygładzania. Mniejszy oznacza spokojniejszy, ale wolniej nadążający obraz. */
const SMOOTHING = 0.16;

const wrapDeg = (v: number) => ((v % 360) + 360) % 360;

export function useDeviceOrientation() {
  const setView = useSkyStore((s) => s.setView);
  /*
   * Czujniki są udostępniane wyłącznie w kontekście uznanym przez przeglądarkę
   * za bezpieczny, czyli przez połączenie szyfrowane albo z adresu localhost.
   * Rozpoznajemy to od razu, bo inaczej przycisk wyglądałby na zepsuty: zgoda by nie
   * przyszła, zdarzenia by nie nadeszły i nic by nie wyjaśniło przyczyny.
   */
  const [status, setStatus] = useState<OrientationStatus>(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    return 'idle';
  });
  const [accuracy, setAccuracy] = useState<number | null>(null);

  /* Wygładzone składowe kierunku patrzenia, trzymane poza stanem Reacta,
   * bo zmieniają się kilkadziesiąt razy na sekundę. */
  const smooth = useRef({ sin: 0, cos: 1, altitude: 0, ready: false });
  const active = useRef(false);
  /*
   * Zaczepienie dla trybu względnego.
   *
   * Wiele telefonów z Androidem nie wysyła zdarzenia bezwzględnego i podaje kąt alpha
   * liczony od dowolnego położenia z chwili uruchomienia czujnika, a nie od północy.
   * Odrzucenie takiego odczytu, co robiła pierwsza wersja, oznaczało komunikat
   * "to urządzenie nie podaje kierunku północy" i koniec, mimo że urządzenie doskonale
   * wie, o ile się obróciło.
   *
   * Zamiast tego przyjmujemy, że w chwili włączenia telefon patrzy tam, gdzie właśnie
   * patrzy mapa, i dalej śledzimy różnice. Obracanie się z telefonem w ręku działa
   * wtedy dokładnie tak, jak ma działać, a jedyne, czego brakuje, to zgodność
   * z prawdziwą północą, którą użytkownik ustawia raz przeciągnięciem mapy.
   */
  const anchor = useRef<{ alpha: number; azimuth: number } | null>(null);

  const handler = useCallback(
    (event: DeviceOrientationEvent) => {
      const e = event as DeviceOrientationEventWithPermission;

      /*
       * Kąt obrotu wokół pionu, sprowadzony do postaci bezwzględnej.
       *
       * Nie jest to jeszcze azymut patrzenia. Azymut policzy kierunekPatrzenia, biorąc
       * pod uwagę wszystkie trzy kąty naraz, bo przy telefonie uniesionym ku niebu sam
       * kąt obrotu przestaje mówić, gdzie celuje tył obudowy.
       *
       * Urządzenia Apple nie podają alpha w postaci bezwzględnej, podają za to gotowy kurs
       * magnetyczny. Przeliczamy go z powrotem na alpha, żeby dalszy rachunek miał jedno
       * wejście, a nie dwa warianty.
       */
      let alphaAbs: number | null = null;
      if (typeof e.webkitCompassHeading === 'number') {
        alphaAbs = (360 - e.webkitCompassHeading) % 360;
        if (typeof e.webkitCompassAccuracy === 'number') setAccuracy(e.webkitCompassAccuracy);
      } else if (e.absolute && typeof e.alpha === 'number') {
        alphaAbs = e.alpha;
      } else if (typeof e.alpha === 'number') {
        /* Tryb względny: pierwszy odczyt zaczepiamy w bieżącym kierunku patrzenia. */
        if (!anchor.current) {
          const stan = useSkyStore.getState();
          /* Zaczepienie liczymy bez poprawki, bo poprawka zostanie dodana niżej.
           * Wliczenie jej tutaj oznaczałoby dodanie tej samej wartości dwa razy. */
          anchor.current = {
            alpha: e.alpha,
            azimuth: wrapDeg(stan.view.azimuth - stan.compass.offsetAzimuth),
          };
          setStatus('relative');
        }
        /* Odtwarzamy alpha takie, jakie dałoby zaczepiony kierunek: różnicę odczytu
         * od zaczepienia przenosimy na kąt odpowiadający zapamiętanemu azymutowi. */
        const delta = e.alpha - anchor.current.alpha;
        alphaAbs = wrapDeg(360 - anchor.current.azimuth + delta);
      }

      if (alphaAbs === null) {
        setStatus('no-compass');
        return;
      }

      /*
       * Kierunek patrzenia z pełnego obrotu urządzenia.
       *
       * Poprzednia wersja brała azymut wprost z kąta obrotu, a wysokość wprost z kąta
       * pochylenia, jakby były niezależne. Nie są: przy telefonie trzymanym pionowo,
       * czyli w położeniu używanym najczęściej, kąt obrotu i kąt przechylenia opisują
       * ten sam ruch i jeden przechodzi w drugi. Odczyt skakał wtedy przy nieruchomym
       * telefonie, a przy unoszeniu go ku niebu obraz uciekał w bok.
       */
      const { azimuth: heading, altitude } = kierunekPatrzenia(
        alphaAbs,
        typeof e.beta === 'number' ? e.beta : 90,
        typeof e.gamma === 'number' ? e.gamma : 0,
      );

      const rad = (heading * Math.PI) / 180;
      const s = smooth.current;
      if (!s.ready) {
        s.sin = Math.sin(rad);
        s.cos = Math.cos(rad);
        s.altitude = altitude;
        s.ready = true;
      } else {
        /*
         * Azymut przyjmujemy z wagą malejącą przy stromym patrzeniu, bo tam przestaje on
         * cokolwiek znaczyć. Wysokość przyjmujemy zawsze w całości, bo jest dobrze
         * określona do samego zenitu.
         */
        const waga = SMOOTHING * wagaAzymutu(altitude);
        s.sin += (Math.sin(rad) - s.sin) * waga;
        s.cos += (Math.cos(rad) - s.cos) * waga;
        s.altitude += (altitude - s.altitude) * SMOOTHING;
      }

      /*
       * Poprawka ustawiona przesunięciem palcem. Dodajemy ją do odczytu czujnika,
       * więc mapa nadal obraca się razem z telefonem, tylko o tyle przesunięta,
       * ile użytkownik wskazał. To jest jedyne miejsce, w którym te dwa źródła
       * kierunku, czujnik i palec, się spotykają.
       */
      const { offsetAzimuth, offsetAltitude } = useSkyStore.getState().compass;
      const azimuth =
        (((Math.atan2(s.sin, s.cos) * 180) / Math.PI + offsetAzimuth) % 360 + 360) % 360;
      setView({ azimuth, altitude: s.altitude + offsetAltitude });
    },
    [setView],
  );

  const stop = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    window.removeEventListener('deviceorientationabsolute', handler);
    window.removeEventListener('deviceorientation', handler);
    smooth.current.ready = false;
    anchor.current = null;
    useSkyStore.getState().setCompassActive(false);
    setStatus('idle');
  }, [handler]);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setStatus('unsupported');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }

    const api = window.DeviceOrientationEvent as unknown as PermissionCapable;
    if (typeof api.requestPermission === 'function') {
      setStatus('asking');
      try {
        const answer = await api.requestPermission();
        if (answer !== 'granted') {
          setStatus('denied');
          return;
        }
      } catch {
        setStatus('denied');
        return;
      }
    }

    /*
     * Zdarzenie bezwzględne jest właściwe, bo tylko ono podaje kąt liczony od północy.
     * Na urządzeniach Apple go nie ma, ale tam zwykłe zdarzenie niesie kurs magnetyczny,
     * więc nasłuchujemy obu i bierzemy to, co przyjdzie.
     */
    anchor.current = null;
    useSkyStore.getState().setCompassActive(true);

    /*
     * JEDNO ŹRÓDŁO ODCZYTU, NIE DWA
     *
     * Poprzednia wersja podpinała oba zdarzenia jednocześnie, do tej samej funkcji.
     * Na Androidzie odpalają się oba, po sześćdziesiąt razy na sekundę każde, i niosą
     * różne układy odniesienia: zdarzenie bezwzględne podaje kąt liczony od północy,
     * zwykłe podaje kąt względem przypadkowego położenia początkowego. Funkcja dostawała
     * je na przemian i liczyła z nich dwa różne kierunki, a wygładzanie uśredniało
     * jeden z drugim. Mapa skakała między nimi i wyglądało to na wadliwy czujnik.
     *
     * Teraz najpierw podpinamy wyłącznie zdarzenie bezwzględne i dajemy mu chwilę.
     * Jeżeli przyjdzie, zostajemy przy nim na stałe. Jeżeli nie przyjdzie, a tak jest
     * na urządzeniach Apple, które go w ogóle nie mają, dopiero wtedy przechodzimy
     * na zdarzenie zwykłe. W żadnej chwili nie słuchamy obu naraz.
     */
    window.addEventListener('deviceorientationabsolute', handler);
    active.current = true;
    setStatus('active');

    window.setTimeout(() => {
      if (!active.current || smooth.current.ready) return;
      window.removeEventListener('deviceorientationabsolute', handler);
      window.addEventListener('deviceorientation', handler);
    }, 600);

    /*
     * Jeżeli w ciągu sekundy nie przyjdzie żadne zdarzenie, czujnik jest wprawdzie
     * zadeklarowany, ale milczy. Zdarza się to na komputerach i w niektórych
     * przeglądarkach wbudowanych w aplikacje. Lepiej powiedzieć o tym wprost,
     * niż zostawić włączony przycisk i nieruchomą mapę.
     */
    window.setTimeout(() => {
      if (active.current && !smooth.current.ready) setStatus('no-compass');
    }, 1200);
  }, [handler]);

  useEffect(() => stop, [stop]);

  return {
    status,
    accuracy,
    start,
    stop,
    active: status === 'active' || status === 'relative',
  };
}
