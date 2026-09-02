import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui';
import { useDeviceOrientation } from '@/state/useDeviceOrientation';
import { useSkyStore } from '@/state/useSkyStore';

import styles from './CompassButton.module.css';

/*
 * Przycisk podążania mapy za telefonem.
 *
 * Siedzi w pasku górnym, obok zegara i miejsca obserwacji, a nie nad mapą. Pierwsza
 * wersja leżała nad osią czasu i po prostu nie dawała się znaleźć: na telefonie
 * wchodziła pod pasek czasu, a przy otwartej sekcji znikała razem z nim.
 * Pasek górny jest widoczny zawsze i w tym samym miejscu, więc ikona też.
 *
 * Widoczny wyłącznie na urządzeniu z ekranem dotykowym i czujnikiem orientacji.
 * Na komputerze byłby martwym elementem, a martwe elementy uczą użytkownika,
 * że przyciski w tym interfejsie bywają nieczynne.
 *
 * Komunikat o przyczynie niedziałania jest osobnym dymkiem pod paskiem, bo każda
 * z czterech możliwych przyczyn ma inne wyjście i użytkownik musi wiedzieć, którą trafił.
 */
export function CompassButton() {
  const { status, accuracy, start, stop, active } = useDeviceOrientation();
  const poprawka = useSkyStore((s) => s.compass.offsetAzimuth);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /*
   * Czy użytkownik już próbował włączyć celowanie.
   *
   * Wyjaśnienie o połączeniu szyfrowanym wchodziło wcześniej samo, przy wejściu na stronę,
   * bo stan "insecure" jest znany od pierwszej klatki. Na telefonie otwartym przez zwykłe
   * http witało to każdego akapitem o certyfikatach, zanim jeszcze cokolwiek nacisnął.
   * Teraz czeka na naciśnięcie przycisku, czyli na moment, w którym ktoś naprawdę pyta,
   * dlaczego to nie działa.
   */
  const [probowal, setProbowal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    setVisible(touch && 'DeviceOrientationEvent' in window);
  }, []);

  useEffect(() => {
    if (status === 'insecure') {
      if (!probowal) {
        setMessage(null);
        return;
      }
      /*
       * Komunikat mówi, co zrobić, a nie tylko co się nie udało.
       *
       * Wymaganie połączenia szyfrowanego dla czujników nie jest kaprysem
       * przeglądarki: kierunek, w którym patrzy urządzenie, w połączeniu z ruchem
       * pozwala odtworzyć zaskakująco dużo o użytkowniku, więc dostęp jest
       * ograniczony tak samo jak do położenia i do kamery. Strona nie ma jak tego
       * obejść i każda próba obejścia byłaby błędem, a nie sprytem.
       */
      setMessage(
        `Czujnik kierunku działa wyłącznie przez połączenie szyfrowane, tak samo jak dostęp do położenia czy kamery. Ta strona jest otwarta przez zwykłe http, więc przeglądarka go nie udostępni i strona nie ma jak tego obejść. Otwórz ten sam adres przez https, czyli ${window.location.href.replace(/^http:/, 'https:')}.`,
      );
    } else if (status === 'denied') {
      setMessage('Brak zgody na dostęp do czujników. Można ją zmienić w ustawieniach przeglądarki.');
    } else if (status === 'relative') {
      /*
       * Tryb względny działa, więc komunikat nie jest ostrzeżeniem o błędzie, tylko
       * instrukcją jednorazowego ustawienia. Obracanie mapy razem z telefonem już
       * działa; brakuje wyłącznie zgodności z prawdziwą północą.
       */
      setMessage(
        'To urządzenie nie podaje kierunku północy. Mapa obraca się razem z telefonem, ale kierunek trzeba ustawić raz samemu: obróć się w stronę, którą znasz, i przeciągnij mapę tak, żeby się zgadzała.',
      );
    } else if (status === 'no-compass') {
      setMessage('Czujnik orientacji nie przysyła odczytów, więc mapa nie może podążać za urządzeniem.');
    } else if (status === 'unsupported') {
      setMessage('Ta przeglądarka nie udostępnia czujnika orientacji.');
    } else if (status === 'active' && accuracy !== null && accuracy > 15) {
      setMessage(
        `Kompas jest niedokładny na ${Math.round(accuracy)} stopni. Zakreśl telefonem w powietrzu kształt ósemki, żeby go wykalibrować.`,
      );
    } else if (status === 'active') {
      /*
       * Jednorazowa podpowiedź o poprawce. Bez niej nikt się nie domyśli, że mapą
       * wolno przy włączonym celowaniu ruszać palcem, bo w większości aplikacji
       * jedno wyklucza drugie. A jest to najważniejsza rzecz w tym trybie: kompas
       * magnetyczny bywa przesunięty o kilkanaście stopni, zwłaszcza w budynku.
       */
      setMessage(
        'Mapa podąża za telefonem. Jeżeli kierunek się nie zgadza, przesuń obraz palcem: poprawka zostanie zapamiętana i mapa dalej będzie się obracać razem z Tobą.',
      );
    } else {
      setMessage(null);
    }
  }, [status, accuracy, probowal]);

  if (!visible) return null;

  /*
   * Poprawka podana w tytule przycisku, a nie osobnym wskaźnikiem na ekranie.
   * Jest to informacja przydatna raz na jakiś czas, a nie taka, która ma zajmować
   * miejsce w pasku. Zero pomijamy, bo brak poprawki nie jest niczym wartym napisania.
   */
  const zaokraglona = Math.round(((poprawka + 180) % 360) - 180);
  const poprawkaWStopniach = zaokraglona === 0 ? null : `${zaokraglona > 0 ? '+' : ''}${zaokraglona} stopni`;

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${active ? styles.buttonActive : ''}`}
        onClick={() => {
          setProbowal(true);
          if (active) stop();
          else void start();
        }}
        aria-pressed={active}
        title={
          active
            ? poprawkaWStopniach
              ? `Wyłącz celowanie. Poprawka kierunku: ${poprawkaWStopniach}. Wyłączenie i włączenie ją zeruje.`
              : 'Wyłącz podążanie mapy za telefonem'
            : 'Skieruj telefon w niebo, a mapa pokaże to, co jest w tym kierunku'
        }
        aria-label={active ? 'Wyłącz celowanie telefonem' : 'Celuj telefonem w niebo'}
      >
        <Icon name="compass" size={17} />
      </button>

      {message && (
        <p className={styles.message} role="status">
          {message}
          <button
            type="button"
            className={styles.messageClose}
            onClick={() => setMessage(null)}
            aria-label="Zamknij komunikat"
          >
            <Icon name="close" size={12} />
          </button>
        </p>
      )}
    </>
  );
}
