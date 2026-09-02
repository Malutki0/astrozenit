import { useMemo } from 'react';

import { ALL_BODY_KEYS, BODY_PROFILES } from '@/lib/astro/constants';
import { positionOf, toObserver } from '@/lib/astro/ephemeris';

import type { BodyKey, GeoLocation } from '@/lib/astro/types';
import { skyTint } from '@/lib/render/layers/skyBackground';
import { formatTime } from '@/lib/format';
import { nightKey, useNightWindow } from '@/state/useNight';
import { useSkyStore } from '@/state/useSkyStore';

import styles from './PlanetVisibility.module.css';

const HOUR_MS = 3600000;
/* Krok próbkowania wysokości. Osiem minut wystarcza, bo najszybszy z tych obiektów,
 * czyli Księżyc, przemieszcza się o niecały stopień na kwadrans. */
const STEP_MS = 8 * 60000;

interface Interval {
  from: Date;
  to: Date;
  /** Czy obiekt wschodzi w obrębie okna, czy był nad horyzontem już na jego początku. */
  risesInside: boolean;
  /** Najwyższe położenie w obrębie odcinka, w stopniach. */
  peak: number;
}

interface BodyRow {
  key: BodyKey;
  name: string;
  color: string;
  intervals: Interval[];
}

/*
 * Uściślenie momentu przejścia przez horyzont.
 * Mamy dwie próbki po przeciwnych stronach zera, więc wystarczy połowienie przedziału.
 * Dwanaście kroków sprowadza niepewność ośmiominutowego odcinka poniżej sekundy.
 */
function refineCrossing(
  key: BodyKey,
  observer: ReturnType<typeof toObserver>,
  belowMs: number,
  aboveMs: number,
): Date {
  let lo = belowMs;
  let hi = aboveMs;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (positionOf(key, new Date(mid), observer).altitude > 0) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}

function buildRows(location: GeoLocation, from: Date, to: Date): BodyRow[] {
  const observer = toObserver(location);
  const rows: BodyRow[] = [];

  for (const key of ALL_BODY_KEYS) {
    if (key === 'sun') continue;
    const profile = BODY_PROFILES[key];
    const intervals: Interval[] = [];

    let openFrom: number | null = null;
    let openRises = false;
    let peak = -90;
    let previousMs = from.getTime();
    let previousUp = positionOf(key, from, observer).altitude > 0;
    if (previousUp) {
      openFrom = from.getTime();
      openRises = false;
    }

    for (let t = from.getTime() + STEP_MS; t <= to.getTime(); t += STEP_MS) {
      const altitude = positionOf(key, new Date(t), observer).altitude;
      const up = altitude > 0;
      if (up) peak = Math.max(peak, altitude);

      if (up && !previousUp) {
        openFrom = refineCrossing(key, observer, previousMs, t).getTime();
        openRises = true;
        peak = altitude;
      } else if (!up && previousUp && openFrom !== null) {
        const end = refineCrossing(key, observer, t, previousMs).getTime();
        intervals.push({ from: new Date(openFrom), to: new Date(end), risesInside: openRises, peak });
        openFrom = null;
        peak = -90;
      }
      previousUp = up;
      previousMs = t;
    }

    if (openFrom !== null) {
      intervals.push({ from: new Date(openFrom), to, risesInside: openRises, peak });
    }

    rows.push({ key, name: profile.name, color: profile.color, intervals });
  }

  return rows;
}

/**
 * Kalendarz widoczności ciał Układu Słonecznego.
 *
 * Odpowiada na pytanie, o której godzinie co jest nad horyzontem. Tło wykresu
 * odwzorowuje rzeczywistą wysokość Słońca, więc od razu widać, które pasmo wypada
 * w prawdziwej ciemności, a które jeszcze w zmierzchu. Kliknięcie wiersza zaznacza
 * obiekt na mapie i ustawia na nim kadr.
 */
export function PlanetVisibility() {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const setDate = useSkyStore((s) => s.setDate);
  const select = useSkyStore((s) => s.select);

  /*
   * Wykres opisuje całą noc, więc przelicza się raz na dobę, a nie przy każdym
   * tyknięciu zegara. Przesuwanie osi czasu porusza wyłącznie pionową kreską
   * bieżącej chwili, co nie wymaga liczenia niczego od nowa.
   */
  const night = useNightWindow(location, date);
  const anchorKey = nightKey(date);

  const data = useMemo(() => {
    const observer = toObserver(location);
    const anchor = new Date(anchorKey);

    /*
     * Okno wykresu obejmuje całą noc z godzinnym zapasem po obu stronach.
     * Krawędzie zaokrąglamy do pełnych godzin, żeby podziałka wypadała równo.
     */
    const sunset = night.sunset ?? new Date(anchor.getTime() + 19 * HOUR_MS);
    const sunrise = night.sunrise ?? new Date(anchor.getTime() + 29 * HOUR_MS);
    const from = new Date(sunset.getTime() - HOUR_MS);
    from.setMinutes(0, 0, 0);
    const to = new Date(sunrise.getTime() + 2 * HOUR_MS);
    to.setMinutes(0, 0, 0);
    const span = Math.max(HOUR_MS, to.getTime() - from.getTime());

    /* Tło zmierzchu, liczone tym samym kodem co tło mapy nieba. */
    const stops: string[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = new Date(from.getTime() + (span * i) / steps);
      const tint = skyTint(positionOf('sun', t, observer).altitude);
      const r = Math.round(tint.zenith[0] * 0.6 + tint.horizon[0] * 0.4);
      const g = Math.round(tint.zenith[1] * 0.6 + tint.horizon[1] * 0.4);
      const b = Math.round(tint.zenith[2] * 0.6 + tint.horizon[2] * 0.4);
      stops.push(`rgb(${r} ${g} ${b}) ${((i / steps) * 100).toFixed(1)}%`);
    }

    /* Podziałka co dwie godziny, tak jak na klasycznych wykresach obserwacyjnych. */
    const ticks: { ratio: number; label: string }[] = [];
    const first = new Date(from);
    first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t <= to.getTime(); t += HOUR_MS) {
      const d = new Date(t);
      if (d.getHours() % 2 !== 0) continue;
      ticks.push({
        ratio: (t - from.getTime()) / span,
        label: String(d.getHours()).padStart(2, '0'),
      });
    }

    return {
      from,
      to,
      span,
      night,
      gradient: `linear-gradient(90deg, ${stops.join(', ')})`,
      ticks,
      rows: buildRows(location, from, to),
    };
  }, [location, anchorKey, night]);

  const ratio = (t: Date) =>
    Math.max(0, Math.min(1, (t.getTime() - data.from.getTime()) / data.span));
  const nowRatio = ratio(date);
  const insideWindow = date >= data.from && date <= data.to;

  return (
    <div className={styles.root}>
      <div className={styles.axis}>
        {data.ticks.map((tick) => (
          <span key={tick.label + tick.ratio} className={styles.axisLabel} style={{ left: `${tick.ratio * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>

      <div className={styles.chart}>
        {/* Tło zmierzchu rozciąga się przez wszystkie wiersze, żeby porównanie
            pasm było możliwe jednym spojrzeniem. */}
        <div className={styles.backdrop} aria-hidden="true">
          <span className={styles.band} style={{ background: data.gradient }} />
          {data.ticks.map((tick) => (
            <span key={`s-${tick.ratio}`} className={styles.gridLine} style={{ left: `${tick.ratio * 100}%` }} />
          ))}
          {insideWindow && <span className={styles.nowLine} style={{ left: `${nowRatio * 100}%` }} />}
        </div>

        <ul className={styles.rows}>
          {data.rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className={styles.row}
                onClick={() => {
                  select({ kind: 'body', key: row.key });
                  const best = row.intervals.find((i) => i.peak > 0);
                  if (best) {
                    const middle = new Date((best.from.getTime() + best.to.getTime()) / 2);
                    setDate(middle);
                  }
                }}
                aria-label={
                  row.intervals.length === 0
                    ? `${row.name}: tej nocy nie wschodzi`
                    : `${row.name}: nad horyzontem od ${formatTime(row.intervals[0].from)} do ${formatTime(row.intervals[row.intervals.length - 1].to)}`
                }
              >
                <span className={styles.label}>
                  {/* Obiekt będący teraz nad horyzontem dostaje obwódkę przy kropce.
                      To ten sam sygnał co pionowa linia bieżącej chwili, tylko czytany
                      wierszami, a nie kolumnami. */}
                  <span
                    className={`${styles.dot} ${row.intervals.some((i) => date >= i.from && date <= i.to) ? styles.dotUp : ''}`}
                    style={{ background: row.color }}
                    aria-hidden="true"
                  />
                  <span className={styles.name}>{row.name}</span>
                </span>
                <span className={styles.track}>
                  {row.intervals.length === 0 ? (
                    <span className={styles.absent}>nie wschodzi</span>
                  ) : (
                    row.intervals.map((interval, i) => {
                      const left = ratio(interval.from) * 100;
                      const width = Math.max(0.8, (ratio(interval.to) - ratio(interval.from)) * 100);
                      return (
                        <span key={i}>
                          <span
                            className={styles.bar}
                            style={{ left: `${left}%`, width: `${width}%`, background: row.color }}
                            title={`${formatTime(interval.from)} do ${formatTime(interval.to)}, najwyżej ${Math.round(interval.peak)} stopni`}
                          />
                          {interval.risesInside &&
                            /* Przy prawej krawędzi wykresu etykieta zostaje przypięta
                             * do prawej strony, inaczej wychodziłaby poza obszar
                             * i była ucinana. */
                            (left > 78 ? (
                              <span
                                className={`${styles.barTime} ${styles.barTimeRight}`}
                                style={{ right: `${Math.max(0, 100 - left - width)}%` }}
                              >
                                {formatTime(interval.from)}
                              </span>
                            ) : (
                              <span className={styles.barTime} style={{ left: `${left}%` }}>
                                {formatTime(interval.from)}
                              </span>
                            ))}
                        </span>
                      );
                    })
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.legend}>
        Pasek pokazuje czas nad horyzontem, a tło rzeczywistą jasność nieba. Najciemniejszy
        fragment to noc astronomiczna
        {data.night.astronomicalDusk && data.night.astronomicalDawn
          ? `, od ${formatTime(data.night.astronomicalDusk)} do ${formatTime(data.night.astronomicalDawn)}.`
          : ', która tej nocy nie zapada.'}{' '}
        Kliknięcie wiersza ustawia mapę na obiekcie w środku okresu jego widoczności.
      </p>
    </div>
  );
}
