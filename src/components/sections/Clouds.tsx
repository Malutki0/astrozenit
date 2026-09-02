import { useEffect, useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Button, Chip, Segmented, Skeleton, Stat } from '@/components/ui';
import { positionOf, toObserver } from '@/lib/astro/ephemeris';
import { nightWindow } from '@/lib/astro/riseSet';
import { cloudFactor, hazeFactor } from '@/lib/astro/visibility';
import { formatDate, formatTime } from '@/lib/format';
import { weatherProvider } from '@/lib/weather/openMeteo';
import type { WeatherHour } from '@/lib/weather/types';
import { hourAt, useWeatherStore } from '@/state/useWeather';
import { useSkyStore } from '@/state/useSkyStore';

import { CloudMap } from './CloudMap';
import type { SectionProps } from './shared';
import styles from './sections.module.css';

/*
 * Sekcja "Chmury".
 *
 * Odpowiada na pytanie, którego nie da się rozstrzygnąć żadnym rachunkiem astronomicznym:
 * czy dziś w ogóle będzie coś widać. Wszystko inne w tej aplikacji liczy się z ruchu ciał
 * niebieskich, a ten jeden czynnik trzeba sprawdzić w prognozie.
 *
 * Układ jest trzyczęściowy: stan na teraz, przebieg najbliższej nocy godzina po godzinie
 * i mapa regionalna, bo przy zmiennym zachmurzeniu często opłaca się przejechać
 * pięćdziesiąt kilometrów w stronę dziury w chmurach.
 */

type View = 'noc' | 'mapa';

/** Ocena warunków wynikająca z samej pogody, bez czynników astronomicznych. */
function weatherScore(hour: WeatherHour): number {
  return Math.round(100 * cloudFactor(hour.cloudCover) * hazeFactor(hour.visibility));
}

function cloudLabel(cover: number): string {
  if (cover < 12) return 'bezchmurnie';
  if (cover < 30) return 'niewielkie zachmurzenie';
  if (cover < 55) return 'zachmurzenie umiarkowane';
  if (cover < 80) return 'zachmurzenie duże';
  return 'zachmurzenie całkowite';
}

/* Barwa paska zachmurzenia. Czyste niebo jest ciemne, chmury jasne, tak jak w rzeczywistości. */
function cloudColor(cover: number, alpha = 1): string {
  const t = Math.max(0, Math.min(100, cover)) / 100;
  const l = 0.18 + t * 0.68;
  const c = 0.03 * (1 - t) + 0.006;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 255 / ${alpha})`;
}

/*
 * Pasek jednej godziny.
 *
 * Wysokość słupka to zachmurzenie całkowite, a podział na trzy odcienie pokazuje,
 * z jakich pięter te chmury pochodzą. Nie jest to suma trzech wartości, bo piętra
 * się nakładają: sto procent chmur niskich i sto procent wysokich to nadal sto procent
 * zakrytego nieba, a nie dwieście. Dlatego udziały pięter rozkładamy proporcjonalnie
 * wewnątrz słupka o wysokości równej zachmurzeniu całkowitemu.
 *
 * Podział ma znaczenie praktyczne: cienkie cirrusy na dużej wysokości przepuszczają
 * jasne gwiazdy i planety, a niski stratus zamyka niebo szczelnie.
 */
function HourBar({ hour, dark, now }: { hour: WeatherHour; dark: boolean; now: boolean }) {
  const total = Math.round(hour.cloudCover);
  const sum = hour.cloudLow + hour.cloudMid + hour.cloudHigh;
  const share = (layer: number) => (sum > 0 ? (layer / sum) * total : 0);

  return (
    <div
      className={`${styles.cloudHour} ${dark ? styles.cloudHourDark : ''} ${now ? styles.cloudHourNow : ''}`}
      title={`${formatTime(hour.time)}: ${total} procent zachmurzenia, ${cloudLabel(total)}. Niskie ${Math.round(hour.cloudLow)}, średnie ${Math.round(hour.cloudMid)}, wysokie ${Math.round(hour.cloudHigh)} procent.`}
    >
      <span className={styles.cloudStack} aria-hidden="true">
        <span
          className={styles.cloudBand}
          style={{ height: `${share(hour.cloudHigh)}%`, background: cloudColor(70, 0.5) }}
        />
        <span
          className={styles.cloudBand}
          style={{ height: `${share(hour.cloudMid)}%`, background: cloudColor(80, 0.75) }}
        />
        <span
          className={styles.cloudBand}
          style={{ height: `${share(hour.cloudLow)}%`, background: cloudColor(92) }}
        />
      </span>
      <span className={`${styles.cloudHourLabel} num`}>{hour.time.getHours()}</span>
    </div>
  );
}

export function CloudsSection({ onClose }: SectionProps) {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const { report, status, error, grid, gridStatus, load, loadGrid, enabled, setEnabled } =
    useWeatherStore();
  const [view, setView] = useState<View>('noc');

  useEffect(() => {
    if (!enabled) return;
    void load(location.lat, location.lon);
  }, [enabled, load, location.lat, location.lon]);

  useEffect(() => {
    if (!enabled || view !== 'mapa') return;
    void loadGrid(location.lat, location.lon);
  }, [enabled, loadGrid, location.lat, location.lon, view]);

  const night = useMemo(() => nightWindow(toObserver(location), date), [location, date]);

  /*
   * Godziny najbliższej nocy: od zachodu Słońca do wschodu. Poza tym oknem prognoza
   * niczego nie wnosi, bo w dzień i tak nie ma czego obserwować.
   */
  const nightHours = useMemo(() => {
    if (!report) return [];
    /* Za kołem podbiegunowym Słońce potrafi nie zajść wcale, więc wtedy pokazujemy
     * po prostu najbliższą dobę zamiast udawać, że okno nocy istnieje. */
    const from = (night.sunset ?? date).getTime() - 3600_000;
    const to = (night.sunrise ?? new Date(date.getTime() + 86400_000)).getTime() + 3600_000;
    return report.hours.filter((h) => h.time.getTime() >= from && h.time.getTime() <= to);
  }, [report, night, date]);

  /* Najlepsze ciągłe okno w tę noc, liczone z pogody i z ciemności nieba. */
  const bestWindow = useMemo(() => {
    if (nightHours.length === 0) return null;
    const observer = toObserver(location);
    const scored = nightHours.map((hour) => {
      const sun = positionOf('sun', hour.time, observer);
      /* Godzina liczy się tylko wtedy, gdy Słońce jest wystarczająco nisko. */
      const darkEnough = sun.altitude < -12;
      return { hour, score: darkEnough ? weatherScore(hour) : 0 };
    });

    let best: { from: Date; to: Date; score: number } | null = null;
    let start = -1;
    let sum = 0;
    for (let i = 0; i <= scored.length; i++) {
      const good = i < scored.length && scored[i].score >= 55;
      if (good) {
        if (start < 0) {
          start = i;
          sum = 0;
        }
        sum += scored[i].score;
      } else if (start >= 0) {
        const length = i - start;
        const average = sum / length;
        /* Wybieramy okno najdłuższe, a przy równej długości najczystsze. */
        const candidate = {
          from: scored[start].hour.time,
          to: new Date(scored[i - 1].hour.time.getTime() + 3600_000),
          score: Math.round(average),
        };
        const currentLength = best ? (best.to.getTime() - best.from.getTime()) / 3600_000 : 0;
        if (!best || length > currentLength || (length === currentLength && candidate.score > best.score)) {
          best = candidate;
        }
        start = -1;
      }
    }
    return best;
  }, [nightHours, location]);

  const current = hourAt(report, date);

  if (!enabled) {
    return (
      <Panel
        eyebrow={location.label}
        title="Chmury"
        onClose={onClose}
        wide
        photoKey="scene:clouds"
      >
        <div className={styles.stack}>
          <p className={styles.hint} style={{ marginTop: 0 }}>
            Pobieranie prognozy jest wyłączone. AstroZenit działa wtedy w całości bez sieci,
            ale ocena warunków pomija zachmurzenie, więc mówi wyłącznie o tym, co wynika
            z położenia ciał niebieskich.
          </p>
          <div>
            <Button variant="primary" onClick={() => setEnabled(true)}>
              Włącz prognozę pogody
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      eyebrow={location.label}
      title="Chmury"
      onClose={onClose}
      wide
      actions={
        <Segmented
          label="Widok chmur"
          value={view}
          onChange={setView}
          options={[
            { value: 'noc', label: 'Ta noc' },
            { value: 'mapa', label: 'Mapa regionu' },
          ]}
        />
      }
    >
      <div className={styles.stack}>
        {status === 'error' && (
          <div className={styles.warnBox}>
            <p style={{ margin: 0 }}>
              Nie udało się pobrać prognozy. {error} Ocena warunków w pozostałych sekcjach
              pomija w tej chwili zachmurzenie.
            </p>
            <Button onClick={() => void load(location.lat, location.lon, true)}>
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {status === 'loading' && !report && (
          <div className={styles.grid}>
            <Skeleton height={62} />
            <Skeleton height={62} />
            <Skeleton height={62} />
            <Skeleton height={62} />
          </div>
        )}

        {current && (
          <div>
            <p className={styles.sectionTitle}>Teraz</p>
            <div className={styles.grid}>
              <Stat label="Zachmurzenie" value={`${Math.round(current.cloudCover)} %`} />
              <Stat label="Widzialność" value={`${(current.visibility / 1000).toFixed(0)} km`} />
              <Stat label="Temperatura" value={`${current.temperature.toFixed(1)} °C`} />
              <Stat label="Wiatr" value={`${Math.round(current.wind)} km/h`} />
            </div>
            <div className={styles.chipRow}>
              <Chip tone={current.cloudCover < 30 ? 'accent' : current.cloudCover < 70 ? 'warn' : 'down'} dot>
                {cloudLabel(current.cloudCover)}
              </Chip>
              <Chip>niskie {Math.round(current.cloudLow)} %</Chip>
              <Chip>średnie {Math.round(current.cloudMid)} %</Chip>
              <Chip>wysokie {Math.round(current.cloudHigh)} %</Chip>
            </div>
            <p className={styles.hint}>
              {current.temperature - current.dewPoint < 2.5
                ? `Temperatura jest o ${(current.temperature - current.dewPoint).toFixed(1)} stopnia wyższa od punktu rosy, więc optyka szybko zajdzie mgłą. Przyda się osłona przeciwrosna albo grzałka.`
                : `Do punktu rosy brakuje ${(current.temperature - current.dewPoint).toFixed(1)} stopnia, więc wyroszenie optyki raczej nie grozi.`}
            </p>
          </div>
        )}

        {view === 'noc' ? (
          <>
            <div className={styles.divider} />
            <div>
              <p className={styles.sectionTitle}>Przebieg najbliższej nocy</p>
              {nightHours.length === 0 ? (
                <p className={styles.hint} style={{ marginTop: 0 }}>
                  {report
                    ? 'Prognoza nie sięga tej nocy. Wróć do dat z najbliższych czterech dni.'
                    : 'Wczytuję prognozę.'}
                </p>
              ) : (
                <>
                  <div className={styles.cloudChart}>
                    {nightHours.map((hour) => (
                      <HourBar
                        key={hour.time.getTime()}
                        hour={hour}
                        dark={
                          positionOf('sun', hour.time, toObserver(location)).altitude < -12
                        }
                        now={Math.abs(hour.time.getTime() - date.getTime()) < 1800_000}
                      />
                    ))}
                  </div>
                  <div className={styles.chipRow}>
                    <Chip>ciemniejsze tło: noc astronomiczna</Chip>
                    <Chip>wysokość słupka: pokrycie nieba</Chip>
                  </div>
                  <p className={styles.hint}>
                    Odcień słupka mówi o piętrze chmur: najjaśniejszy pas na dole to chmury
                    niskie, które zamykają niebo szczelnie, a najsłabszy u góry to wysokie
                    cirrusy, przez które przebijają się jaśniejsze gwiazdy i planety.
                  </p>
                  {bestWindow ? (
                    <p className={styles.hint}>
                      Najlepsze okno tej nocy: {formatTime(bestWindow.from)} do{' '}
                      {formatTime(bestWindow.to)}, średnia ocena pogody {bestWindow.score} na 100.
                    </p>
                  ) : (
                    <p className={styles.hint}>
                      Tej nocy nie ma godziny, w której zachmurzenie spadłoby na tyle, żeby
                      warto było rozstawiać sprzęt. Sprawdź mapę regionu, może kilkadziesiąt
                      kilometrów dalej niebo jest czyste.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.divider} />
            <div>
              <p className={styles.sectionTitle}>Zachmurzenie w promieniu dwustu kilometrów</p>
              {gridStatus === 'loading' && !grid ? (
                <Skeleton height={320} />
              ) : grid ? (
                <CloudMap grid={grid} date={date} location={location} />
              ) : (
                <div className={styles.warnBox}>
                  <p style={{ margin: 0 }}>Nie udało się pobrać mapy zachmurzenia.</p>
                  <Button onClick={() => void loadGrid(location.lat, location.lon, true)}>
                    Spróbuj ponownie
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        <div className={styles.divider} />
        <p className={styles.hint} style={{ marginTop: 0 }}>
          {weatherProvider.attribution}. Prognoza dla {location.label}, pobrana{' '}
          {report ? `${formatTime(new Date(report.fetchedAt))}, ${formatDate(new Date(report.fetchedAt))}` : 'przed chwilą'}.
          Dane odświeżają się co pół godziny.
        </p>
      </div>
    </Panel>
  );
}
