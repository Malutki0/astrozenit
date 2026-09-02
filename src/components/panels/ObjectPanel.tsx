import { useMemo } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Button, Chip, IconButton, PhotoFrame, Stat } from '@/components/ui';
import { toObserver } from '@/lib/astro/ephemeris';
import { altitudeCurve } from '@/lib/astro/riseSet';
import { GRADE_TONE } from '@/lib/astro/visibility';
import type { CatalogBundle } from '@/lib/catalog/types';
import {
  formatAzimuth,
  formatDegrees,
  formatDec,
  formatKm,
  formatLightYears,
  formatMagnitude,
  formatRa,
  formatTime,
} from '@/lib/format';
import { resolveRef } from '@/lib/objects';
import { useSkyStore } from '@/state/useSkyStore';
import { useSkyContext } from '@/state/useSkyContext';
import { usePhotos } from '@/state/usePhotos';
import { refKey } from '@/lib/render/types';
import type { BodyKey } from '@/lib/astro/types';

import { PlanetGlobe } from './PlanetGlobe';
import { StarDisc } from './StarDisc';
import { useAuthStore } from '@/state/useAuth';
import { useFavouritesStore } from '@/state/useFavourites';

/* Ciała, dla których mamy mapę powierzchni w atlasie tekstur. */
const HAS_SURFACE = new Set<BodyKey>([
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'moon',
  'sun',
]);

import styles from './ObjectPanel.module.css';

/** Pierścień oceny widoczności. Łuk odpowiada punktacji od zera do stu. */
function Gauge({ score, tone }: { score: number; tone: 'visible' | 'warn' | 'down' }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const color =
    tone === 'visible'
      ? 'var(--signal-visible)'
      : tone === 'warn'
        ? 'var(--signal-warn)'
        : 'var(--signal-down)';
  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="var(--surface-overlay)" strokeWidth="3" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
          transform="rotate(-90 26 26)"
          style={{ transition: 'stroke-dasharray var(--dur-panel) var(--ease-out)' }}
        />
      </svg>
      <span className={styles.gaugeValue}>{score}</span>
    </div>
  );
}

/**
 * Wykres wysokości obiektu nad horyzontem w ciągu najbliższej doby.
 * Pole poniżej zera jest wyszarzone, więc od razu widać, kiedy obiekt jest pod horyzontem.
 */
function AltitudeChart({
  ra,
  dec,
  location,
  date,
}: {
  ra: number;
  dec: number;
  location: Parameters<typeof toObserver>[0];
  date: Date;
}) {
  const points = useMemo(() => {
    const observer = toObserver(location);
    const start = new Date(date);
    start.setHours(12, 0, 0, 0);
    if (date.getHours() < 12) start.setTime(start.getTime() - 24 * 3600000);
    const end = new Date(start.getTime() + 24 * 3600000);
    return { curve: altitudeCurve(ra, dec, observer, start, end, 72), start, end };
  }, [ra, dec, location, date]);

  const width = 300;
  const height = 88;
  const toX = (t: Date) =>
    ((t.getTime() - points.start.getTime()) / (points.end.getTime() - points.start.getTime())) * width;
  /* Skala pionowa obejmuje od minus trzydziestu do dziewięćdziesięciu stopni. */
  const toY = (alt: number) => height - ((Math.max(-30, Math.min(90, alt)) + 30) / 120) * height;

  const path = points.curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.time).toFixed(1)} ${toY(p.altitude).toFixed(1)}`)
    .join(' ');
  const horizonY = toY(0);
  const nowX = toX(date);

  return (
    <div className={styles.chart}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Wysokość obiektu nad horyzontem w ciągu doby">
        <rect x="0" y={horizonY} width={width} height={height - horizonY} fill="oklch(0.06 0.02 265 / 0.55)" />
        <line x1="0" y1={horizonY} x2={width} y2={horizonY} stroke="var(--hairline-strong)" strokeWidth="1" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <line x1={nowX} y1="0" x2={nowX} y2={height} stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.chartLabel} style={{ left: 6 }}>
        12:00
      </span>
      <span className={styles.chartLabel} style={{ left: '50%', transform: 'translateX(-50%)' }}>
        00:00
      </span>
      <span className={styles.chartLabel} style={{ right: 6 }}>
        12:00
      </span>
    </div>
  );
}

export function ObjectPanel({
  catalog,
  hiddenOnNarrow,
}: {
  catalog: CatalogBundle;
  hiddenOnNarrow?: boolean;
}) {
  const selected = useSkyStore((s) => s.selected);
  const select = useSkyStore((s) => s.select);
  const focusOn = useSkyStore((s) => s.focusOn);
  const location = useSkyStore((s) => s.location);
  const date = useSkyStore((s) => s.date);
  const ctx = useSkyContext(catalog);
  const photos = usePhotos();
  const session = useAuthStore((s) => s.session);
  const ulubione = useFavouritesStore((s) => s.items);
  const przelacz = useFavouritesStore((s) => s.toggle);

  const detail = useMemo(() => (selected ? resolveRef(selected, ctx) : null), [selected, ctx]);

  /*
   * Indeks barwy gwiazdy. Warstwa opisowa katalogu go nie niesie, bo jest to wielkość
   * pomiarowa, a nie opisowa, więc sięgamy po niego wprost do katalogu binarnego.
   * Wyszukiwanie liniowe po dziewięciu tysiącach pozycji jest tu w porządku: dzieje się
   * raz przy otwarciu panelu, a nie w pętli rysowania.
   */
  const indeksBarwy = useMemo(() => {
    if (selected?.kind !== 'star' || !selected.hip) return null;
    const stars = catalog.stars;
    for (let i = 0; i < stars.count; i++) {
      if (stars.hip[i] === selected.hip) {
        const bv = stars.colorIndex[i];
        return Number.isFinite(bv) ? bv : null;
      }
    }
    return null;
  }, [selected, catalog]);

  if (!selected || !detail) return null;

  const naLiscie = ulubione.some((i) => i.ref === refKey(detail.ref));

  const { visibility, riseSet } = detail;
  const tone = GRADE_TONE[visibility.grade];

  return (
    <div className={hiddenOnNarrow ? styles.hiddenOnNarrow : undefined}>
      <Panel
        side="right"
        eyebrow={[detail.kind, detail.constellation].filter(Boolean).join(' , ')}
        title={detail.name}
        onClose={() => select(null)}
        actions={
          /*
           * Dodanie do listy obserwacyjnej. Przycisk pojawia się wyłącznie po
           * zalogowaniu, bo lista jest przypisana do konta. Pokazywanie go gościom
           * i odsyłanie ich do logowania dopiero po naciśnięciu byłoby obietnicą
           * bez pokrycia, a takie przyciski uczą, że przyciski bywają nieczynne.
           */
          session ? (
            <IconButton
              icon="star"
              label={
                naLiscie ? 'Usuń z listy obserwacyjnej' : 'Dodaj do listy obserwacyjnej'
              }
              active={naLiscie}
              onClick={() =>
                przelacz({
                  ref: refKey(detail.ref),
                  label: detail.name,
                  kind: detail.kind,
                })
              }
            />
          ) : undefined
        }
      >
        <div className={styles.body}>
          {detail.subtitle && (
            <p className={styles.verdictReason} style={{ marginTop: 'calc(var(--space-4) * -1)' }}>
              {detail.subtitle}
            </p>
          )}

          {/*
            * Globus pokazujemy tylko dla ciał, dla których mamy mapę powierzchni.
            * Dla gwiazd i obiektów głębokiego nieba nie ma czego obracać: to punkty
            * albo mgławice, a wstawienie w tym miejscu wymyślonej kuli byłoby
            * ilustracją czegoś, czego nie widać.
            */}
          {detail.ref.kind === 'body' && HAS_SURFACE.has(detail.ref.key) && (
            <PlanetGlobe body={detail.ref.key} size={200} />
          )}

          {/*
            * Gwiazda dostaje tarczę liczoną z jej własnych pomiarów: barwa z indeksu
            * B-V, wielkość korony z jasności. Fotografii gwiazd nie ma, bo poza Słońcem
            * żadna nie ma dostrzegalnej tarczy, więc rysunek z pomiarów jest tu
            * uczciwszy od czegokolwiek, co dałoby się w to miejsce wstawić.
            */}
          {detail.ref.kind === 'star' && (
            <StarDisc
              colorIndex={indeksBarwy}
              magnitude={detail.magnitude}
              label={detail.name}
              size={168}
            />
          )}

          {/*
            * Zdjęcie tam, gdzie fotografia naprawdę istnieje. Mgławica ani gromada
            * nie są kulami, więc jedyne, co można pokazać wiernie, to fotografia.
            * Autor i licencja idą razem ze zdjęciem, bo tego wymagają warunki,
            * na jakich wolno je tu wyświetlić.
            */}
          {detail.ref.kind !== 'body' && detail.ref.kind !== 'star' && (
            <PhotoFrame photo={photos[refKey(detail.ref)]} alt={detail.name} />
          )}

          <div className={styles.verdict}>
            <Gauge score={visibility.score} tone={tone} />
            <div className={styles.verdictText}>
              <span className={styles.verdictGrade}>Warunki {visibility.grade}</span>
              <span className={styles.verdictReason}>{visibility.reason}</span>
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Położenie teraz</p>
            <div className={styles.grid}>
              <Stat label="Wysokość" value={formatDegrees(detail.altitude)} />
              <Stat label="Azymut" value={formatAzimuth(detail.azimuth)} />
              {detail.magnitude !== null && (
                <Stat label="Jasność" value={`${formatMagnitude(detail.magnitude)} mag`} />
              )}
              {detail.distanceLy !== null && (
                <Stat label="Odległość" value={formatLightYears(detail.distanceLy)} />
              )}
              {detail.distanceKm !== null && (
                <Stat label="Odległość" value={formatKm(detail.distanceKm)} />
              )}
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Wysokość nad horyzontem w ciągu doby</p>
            <AltitudeChart ra={detail.ra} dec={detail.dec} location={location} date={date} />
            <div className={styles.grid}>
              {riseSet.circumpolar ? (
                <Stat label="Widoczność" value="nie zachodzi" />
              ) : riseSet.neverRises ? (
                <Stat label="Widoczność" value="nie wschodzi" />
              ) : (
                <>
                  <Stat label="Wschód" value={formatTime(riseSet.rise)} />
                  <Stat label="Zachód" value={formatTime(riseSet.set)} />
                </>
              )}
              <Stat
                label="Górowanie"
                value={
                  riseSet.transit
                    ? `${formatTime(riseSet.transit)} , ${formatDegrees(riseSet.transitAltitude ?? 0, 0)}`
                    : 'brak'
                }
              />
            </div>
          </div>

          {detail.note && <p className={styles.note}>{detail.note}</p>}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Dane szczegółowe</p>
            <div className={styles.facts}>
              <div className={styles.fact}>
                <span className={styles.factLabel}>Rektascensja</span>
                <span className={styles.factValue}>{formatRa(detail.ra)}</span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>Deklinacja</span>
                <span className={styles.factValue}>{formatDec(detail.dec)}</span>
              </div>
              {detail.facts.map((fact) => (
                <div key={fact.label} className={styles.fact}>
                  <span className={styles.factLabel}>{fact.label}</span>
                  <span className={styles.factValue}>{fact.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              icon="target"
              variant="secondary"
              fullWidth
              onClick={() => focusOn(detail.azimuth, detail.altitude, 26)}
              disabled={detail.altitude <= -5}
            >
              Pokaż na mapie
            </Button>
          </div>

          {detail.altitude <= 0 && (
            <Chip tone="down" dot>
              Obiekt pod horyzontem
            </Chip>
          )}
        </div>
      </Panel>
    </div>
  );
}
