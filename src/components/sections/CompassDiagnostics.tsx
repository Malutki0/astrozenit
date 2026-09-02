import { useEffect, useRef, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Button } from '@/components/ui';
import { kierunekPatrzenia } from '@/lib/orientation';

import styles from './sections.module.css';

/*
 * Diagnostyka czujnika orientacji.
 *
 * Strona powstała po dwóch nietrafionych poprawkach kompasu z rzędu. Obie przechodziły
 * moje testy i obie nie działały na prawdziwym telefonie, co znaczy tyle, że mój model
 * tego, co telefon wysyła, był błędny, a testy sprawdzały ten sam błędny model.
 * Zgadywanie w takiej sytuacji jest marnowaniem czasu obu stron.
 *
 * Ta strona nie naprawia niczego. Pokazuje surowe liczby prosto z czujnika, bez żadnego
 * przetwarzania, obok liczb wyliczonych, i pozwala je skopiować. Dopiero mając odczyty
 * z konkretnego urządzenia da się powiedzieć, co jest nie tak.
 */

interface Odczyt {
  zdarzenie: string;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  kursApple: number | null;
}

function liczba(v: number | null | undefined, miejsca = 1): string {
  return typeof v === 'number' ? v.toFixed(miejsca) : 'brak';
}

export function CompassDiagnosticsSection({ onClose }: { onClose: () => void }) {
  const [odczyt, setOdczyt] = useState<Odczyt | null>(null);
  const [licznik, setLicznik] = useState({ absolutne: 0, zwykle: 0 });
  const [dziala, setDziala] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [skopiowane, setSkopiowane] = useState(false);
  const liczniki = useRef({ absolutne: 0, zwykle: 0 });

  useEffect(() => {
    if (!dziala) return;

    const zapisz = (nazwa: string) => (event: Event) => {
      const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      if (nazwa === 'deviceorientationabsolute') liczniki.current.absolutne++;
      else liczniki.current.zwykle++;
      setOdczyt({
        zdarzenie: nazwa,
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        absolute: Boolean(e.absolute),
        kursApple: typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : null,
      });
    };

    /* Tu, wyjątkowo, słuchamy obu naraz. To jest właśnie to, co chcemy zmierzyć:
     * które zdarzenia w ogóle przychodzą na tym urządzeniu i jak często. */
    const a = zapisz('deviceorientationabsolute');
    const b = zapisz('deviceorientation');
    window.addEventListener('deviceorientationabsolute', a);
    window.addEventListener('deviceorientation', b);
    const id = window.setInterval(() => setLicznik({ ...liczniki.current }), 500);

    return () => {
      window.removeEventListener('deviceorientationabsolute', a);
      window.removeEventListener('deviceorientation', b);
      window.clearInterval(id);
    };
  }, [dziala]);

  const start = async () => {
    setBlad(null);
    if (!window.isSecureContext) {
      setBlad('Strona nie jest otwarta przez połączenie szyfrowane, więc czujnik jest zablokowany.');
      return;
    }
    const api = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof api?.requestPermission === 'function') {
      try {
        const odp = await api.requestPermission();
        if (odp !== 'granted') {
          setBlad(`Brak zgody na czujnik, odpowiedź: ${odp}.`);
          return;
        }
      } catch (e) {
        setBlad(`Prośba o zgodę nie powiodła się: ${String(e)}`);
        return;
      }
    }
    liczniki.current = { absolutne: 0, zwykle: 0 };
    setDziala(true);
  };

  const wyliczony = odczyt
    ? kierunekPatrzenia(odczyt.alpha ?? 0, odczyt.beta ?? 90, odczyt.gamma ?? 0)
    : null;

  const raport = [
    `urzadzenie: ${navigator.userAgent}`,
    `bezpieczny kontekst: ${window.isSecureContext}`,
    `obrot ekranu: ${screen.orientation?.angle ?? 'brak'} (${screen.orientation?.type ?? 'brak'})`,
    `zdarzen bezwzglednych: ${licznik.absolutne}`,
    `zdarzen zwyklych: ${licznik.zwykle}`,
    `ostatnie zdarzenie: ${odczyt?.zdarzenie ?? 'brak'}`,
    `absolute: ${odczyt?.absolute ?? 'brak'}`,
    `alpha: ${liczba(odczyt?.alpha)}`,
    `beta: ${liczba(odczyt?.beta)}`,
    `gamma: ${liczba(odczyt?.gamma)}`,
    `kurs Apple: ${liczba(odczyt?.kursApple)}`,
    `wyliczony azymut: ${liczba(wyliczony?.azimuth)}`,
    `wyliczona wysokosc: ${liczba(wyliczony?.altitude)}`,
  ].join('\n');

  return (
    <Panel eyebrow="Diagnostyka" title="Czujnik orientacji" onClose={onClose} wide>
      <div className={styles.stack}>
        <p className={styles.lead}>
          Ta strona nic nie naprawia. Pokazuje surowe odczyty czujnika, żeby dało się
          ustalić, co dokładnie wysyła to urządzenie. Naciśnij start, poruszaj telefonem,
          a potem skopiuj wynik.
        </p>

        {!dziala && (
          <div>
            <Button variant="primary" onClick={() => void start()}>
              Start pomiaru
            </Button>
          </div>
        )}

        {blad && <p className={styles.hint}>{blad}</p>}

        {dziala && (
          <div className={styles.list}>
            {[
              ['Zdarzeń bezwzględnych', String(licznik.absolutne)],
              ['Zdarzeń zwykłych', String(licznik.zwykle)],
              ['Ostatnie zdarzenie', odczyt?.zdarzenie ?? 'żadne'],
              ['Pole absolute', odczyt ? String(odczyt.absolute) : 'brak'],
              ['alpha, obrót', liczba(odczyt?.alpha)],
              ['beta, pochylenie', liczba(odczyt?.beta)],
              ['gamma, przechylenie', liczba(odczyt?.gamma)],
              ['Kurs Apple', liczba(odczyt?.kursApple)],
              ['Wyliczony azymut', liczba(wyliczony?.azimuth)],
              ['Wyliczona wysokość', liczba(wyliczony?.altitude)],
              ['Obrót ekranu', String(screen.orientation?.angle ?? 'brak')],
            ].map(([nazwa, wartosc]) => (
              <div className={styles.row} key={nazwa}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{nazwa}</span>
                </span>
                <span className={`${styles.rowValue} num`}>{wartosc}</span>
              </div>
            ))}
          </div>
        )}

        {dziala && (
          <div>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(raport).then(
                  () => setSkopiowane(true),
                  () => setSkopiowane(false),
                );
              }}
            >
              {skopiowane ? 'Skopiowane' : 'Kopiuj wynik'}
            </Button>
          </div>
        )}

        <p className={styles.hint}>
          Najbardziej przydatne są trzy pomiary: telefon pionowo przed sobą, telefon
          uniesiony do połowy i telefon skierowany prosto w górę. Za każdym razem
          skopiuj wynik.
        </p>
      </div>
    </Panel>
  );
}
