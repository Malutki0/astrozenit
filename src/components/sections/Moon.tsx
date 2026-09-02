import { useMemo } from 'react';

import { Panel } from '@/components/shell/Panel';
import { PlanetGlobe } from '@/components/panels/PlanetGlobe';
import { Chip, Stat } from '@/components/ui';
import { toObserver } from '@/lib/astro/ephemeris';
import { monthIllumination, moonState, nextQuarters, phaseDescriptor, quartersInMonth } from '@/lib/astro/moon';
import { riseSetOf, startOfLocalDay } from '@/lib/astro/riseSet';
import {
  formatDate,
  formatDays,
  formatDegrees,
  formatKm,
  formatMagnitude,
  formatMonthYear,
  formatPercent,
  formatTime,
  relativeDays,
} from '@/lib/format';
import { useSkyStore } from '@/state/useSkyStore';

import type { SectionProps } from './shared';
import styles from './sections.module.css';

/**
 * Rysunek tarczy Księżyca.
 *
 * Terminator to elipsa, której półoś zależy od oświetlonej części tarczy.
 * Nie jest to nakładka graficzna, tylko ta sama konstrukcja, której używa mapa nieba,
 * więc rysunek zawsze zgadza się z tym, co widać przez okno.
 */
function MoonDisc({
  illumination,
  waxing,
  size = 168,
}: {
  illumination: number;
  waxing: boolean;
  size?: number;
}) {
  /* Poświatę rysujemy tylko przy dużej tarczy. Miniatury w pasku miesięcznym
   * występują w kilkudziesięciu egzemplarzach naraz, a powielony identyfikator
   * gradientu byłby błędem w dokumencie. */
  const withGlow = size >= 64;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const rx = r * Math.abs(2 * illumination - 1);
  const sweepOuter = 1;
  /*
   * Zarys jasnej części tarczy: prawy półokrąg brzegu plus terminator w postaci
   * połowy elipsy. Kierunek drugiego łuku decyduje o tym, czy elipsa wcina się
   * w tarczę, czy ją dopełnia. Przy fazie poniżej połowy terminator wybrzusza się
   * w stronę oświetlonego brzegu, czyli biegnie od dołu ku górze prawą stroną,
   * co w układzie SVG odpowiada fladze zero. Powyżej połowy jest odwrotnie.
   * Poprawność sprawdzona pomiarem udziału jasnych pikseli dla siedmiu faz.
   */
  const sweepInner = illumination < 0.5 ? 0 : 1;

  const path = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Tarcza Księżyca oświetlona w ${Math.round(illumination * 100)} procentach`}
      className={styles.moonDisc}
    >
      {withGlow && (
        <>
          <defs>
            <radialGradient id="poswiataKsiezyca" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="rgb(226 232 246)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="rgb(226 232 246)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={r * 1.5} fill="url(#poswiataKsiezyca)" />
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill="oklch(0.19 0.014 265)" />
      {/* Odwracamy rysunek dla fazy ubywającej, bo wtedy świeci lewa krawędź tarczy. */}
      <g transform={waxing ? undefined : `scale(-1 1) translate(${-size} 0)`}>
        <path d={path} fill="oklch(0.93 0.012 85)" />
      </g>
      {withGlow && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth="1" />
      )}
    </svg>
  );
}

const QUARTER_ICON: Record<number, string> = { 0: 'nów', 1: 'pierwsza kwadra', 2: 'pełnia', 3: 'ostatnia kwadra' };

export function MoonSection({ onClose, catalog }: SectionProps) {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const setDate = useSkyStore((s) => s.setDate);

  const data = useMemo(() => {
    const observer = toObserver(location);
    const state = moonState(date, observer);
    return {
      state,
      riseSet: riseSetOf('moon', observer, startOfLocalDay(date)),
      quarters: nextQuarters(date, 4),
      monthQuarters: quartersInMonth(date.getFullYear(), date.getMonth()),
      illumination: monthIllumination(date.getFullYear(), date.getMonth()),
    };
  }, [date, location]);

  const { state } = data;
  const descriptor = phaseDescriptor(state.phaseAngleDeg);
  /* Silnik zwraca skrót łaciński, a użytkownikowi pokazujemy nazwę polską. */
  const constellationPl =
    catalog.constellations.find((c) => c.id === state.constellation)?.pl ?? state.constellation;

  return (
    <Panel
      eyebrow={descriptor.name}
      title="Księżyc"
      onClose={onClose}
      photoKey="scene:moon"
    >
      <div className={styles.stack}>
        <div className={styles.moonHero}>
          {/* Prawdziwa mapa powierzchni z odwzorowaną fazą, a nie sam kształt sierpa.
            * Morza księżycowe są tym, co widać gołym okiem, więc bez nich obraz
            * nie przedstawiał Księżyca, tylko oświetloną kulę. */}
          <PlanetGlobe
            body="moon"
            size={168}
            illumination={state.phaseFraction}
            waxing={state.waxing}
            locked
          />
          <div className={styles.moonHeroText}>
            <p className={styles.moonPercent}>{formatPercent(state.phaseFraction)}</p>
            <p className={styles.hint} style={{ marginTop: 0 }}>
              tarczy oświetlone, {state.waxing ? 'faza przybywa' : 'faza ubywa'}
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          <Stat label="Wiek" value={formatDays(state.ageDays)} />
          <Stat label="Odległość" value={formatKm(state.distanceKm)} />
          <Stat label="Średnica" value={`${(state.angularSizeArcsec / 60).toFixed(1).replace('.', ',')}'`} />
          <Stat label="Jasność" value={`${formatMagnitude(state.magnitude)} mag`} />
          <Stat label="Wysokość" value={formatDegrees(state.position.altitude)} />
          <Stat label="Gwiazdozbiór" value={constellationPl} />
        </div>

        {state.position.altitude <= 0 && (
          <Chip tone="down" dot>
            Księżyc jest teraz pod horyzontem
          </Chip>
        )}

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Wschód i zachód</p>
          <div className={styles.grid}>
            {data.riseSet.circumpolar ? (
              <Stat label="Widoczność" value="nie zachodzi" />
            ) : data.riseSet.neverRises ? (
              <Stat label="Widoczność" value="nie wschodzi" />
            ) : (
              <>
                <Stat label="Wschód" value={formatTime(data.riseSet.rise)} />
                <Stat label="Zachód" value={formatTime(data.riseSet.set)} />
              </>
            )}
            <Stat
              label="Górowanie"
              value={
                data.riseSet.transit
                  ? `${formatTime(data.riseSet.transit)} , ${formatDegrees(data.riseSet.transitAltitude ?? 0, 0)}`
                  : 'brak'
              }
            />
          </div>
        </div>

        <div>
          <p className={styles.sectionTitle}>Libracja</p>
          <div className={styles.grid}>
            <Stat label="Długość" value={formatDegrees(state.librationLon, 2)} />
            <Stat label="Szerokość" value={formatDegrees(state.librationLat, 2)} />
          </div>
          <p className={styles.hint}>
            Księżyc kołysze się względem nas o kilka stopni w obie strony, dzięki czemu w sumie
            widzimy blisko dziewięćdziesiąt procent jego powierzchni, a nie połowę.
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Najbliższe kwadry</p>
          <div className={styles.list}>
            {data.quarters.map((q) => (
              <button
                key={q.date.toISOString()}
                type="button"
                className={styles.row}
                onClick={() => setDate(q.date)}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{q.name}</span>
                  <span className={styles.rowSub}>
                    {formatDate(q.date)} , {relativeDays(q.date, date)}
                  </span>
                </span>
                <span className={styles.rowValue}>{formatTime(q.date)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={styles.sectionTitle}>Fazy w miesiącu: {formatMonthYear(date)}</p>
          <div className={styles.phaseStrip}>
            {data.illumination.map((day) => {
              const quarter = data.monthQuarters.find((q) => q.date.getDate() === day.day);
              const isToday = day.day === date.getDate();
              return (
                <button
                  key={day.day}
                  type="button"
                  className={`${styles.phaseDay} ${isToday ? styles.phaseDayNow : ''}`}
                  title={`${day.day} , ${formatPercent(day.fraction)} oświetlenia${quarter ? `, ${QUARTER_ICON[quarter.quarter]}` : ''}`}
                  onClick={() => {
                    const next = new Date(date);
                    next.setDate(day.day);
                    setDate(next);
                  }}
                >
                  <span className={styles.phaseMini}>
                    <MoonDisc
                      illumination={day.fraction}
                      waxing={day.phase < 180}
                      size={18}
                    />
                  </span>
                  <span className={styles.phaseNum}>{day.day}</span>
                  {quarter && <span className={styles.phaseMark} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}
