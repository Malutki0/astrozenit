import type { ReactNode } from 'react';

import { Icon, PhotoThumb, type IconName } from '@/components/ui';
import { PlanetGlobe } from '@/components/panels/PlanetGlobe';
import type { BodyKey } from '@/lib/astro/types';
import { GRADE_TONE } from '@/lib/astro/visibility';
import type { Visibility } from '@/lib/astro/types';
import type { CatalogBundle } from '@/lib/catalog/types';
import { formatDegrees } from '@/lib/format';
import type { ObjectDetail } from '@/lib/objects';
import { refKey, sameRef, type SkyObjectRef } from '@/lib/render/types';
import { useSkyStore } from '@/state/useSkyStore';
import { usePhotos } from '@/state/usePhotos';

import styles from './sections.module.css';

export interface SectionProps {
  onClose: () => void;
  catalog: CatalogBundle;
}

/* Ciała, dla których mamy mapę powierzchni ze zdjęć sond. */
const MA_MAPE = new Set<BodyKey>([
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

const TONE_COLOR: Record<'visible' | 'warn' | 'down', string> = {
  visible: 'var(--signal-visible)',
  warn: 'var(--signal-warn)',
  down: 'var(--signal-down)',
};

/** Pasek oceny widoczności. Kolor niesie tę samą informację co szerokość, ale nigdy sam. */
export function ScoreBar({ visibility }: { visibility: Visibility }) {
  const tone = GRADE_TONE[visibility.grade];
  return (
    <span
      className={styles.scoreBar}
      title={`Warunki ${visibility.grade}, ocena ${visibility.score} na 100. ${visibility.reason}`}
    >
      <span
        className={styles.scoreFill}
        /* Ocena zero zostaje pusta. Minimalna szerokość dotyczy tylko ocen niezerowych,
          * żeby jeden punkt był w ogóle widoczny, ale nie udawał, że coś jest do zobaczenia. */
        style={{
          width: visibility.score === 0 ? '0%' : `${Math.max(4, visibility.score)}%`,
          background: TONE_COLOR[tone],
        }}
      />
    </span>
  );
}

/**
 * Wiersz listy obiektów.
 *
 * Kliknięcie zaznacza obiekt i ustawia na nim mapę, więc lista i mapa zawsze
 * pokazują to samo. Wiersz jest przyciskiem, nie elementem listy z uchwytem,
 * dzięki czemu działa z klawiatury bez dodatkowej obsługi.
 */
export function ObjectRow({
  detail,
  icon,
  trailing,
  subtitle,
}: {
  detail: ObjectDetail;
  icon?: IconName;
  trailing?: ReactNode;
  subtitle?: string;
}) {
  const selected = useSkyStore((s) => s.selected);
  const select = useSkyStore((s) => s.select);
  const focusOn = useSkyStore((s) => s.focusOn);
  const photos = usePhotos();
  const isSelected = sameRef(selected, detail.ref as SkyObjectRef);
  const photo = photos[refKey(detail.ref as SkyObjectRef)];

  const activate = () => {
    select(detail.ref);
    if (detail.altitude > -5) focusOn(detail.azimuth, detail.altitude);
  };

  return (
    <button
      type="button"
      className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
      onClick={activate}
      aria-current={isSelected || undefined}
    >
      {/*
        * Zdjęcie zastępuje ikonę tam, gdzie jest dostępne. Ikona mgławicy mówi
        * tylko tyle, że to mgławica; zdjęcie mówi, która. Gdy zdjęcia brak,
        * wracamy do ikony, więc lista nigdy nie ma dziur.
        */}
      {/*
        * Kolejność jest tu wyborem, a nie przypadkiem. Zdjęcie mówi najwięcej,
        * więc idzie pierwsze. Dla planet zdjęcia nie ma, ale jest mapa powierzchni,
        * z której rysujemy tarczę: pasy Jowisza albo pierścienie Saturna rozpoznaje
        * się z czterdziestu pikseli, a jednakowa ikona planety z żadnej wielkości.
        * Ikona zostaje na końcu, dla wszystkiego pozostałego.
        */}
      {photo ? (
        <span className={styles.rowPhoto}>
          <PhotoThumb photo={photo} alt={detail.name} size={40} />
        </span>
      ) : detail.ref.kind === 'body' && MA_MAPE.has(detail.ref.key) ? (
        <span className={styles.rowGlobe}>
          <PlanetGlobe body={detail.ref.key} size={38} still locked />
        </span>
      ) : (
        icon && <Icon name={icon} size={17} className={styles.rowIcon} />
      )}
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{detail.name}</span>
        <span className={styles.rowSub}>
          {subtitle ?? [detail.kind, detail.constellation].filter(Boolean).join(' , ')}
        </span>
      </span>
      <span className={styles.rowNumbers}>
        {trailing ?? (
          <span
            className={`${styles.rowValue} ${detail.altitude <= 0 ? styles.rowValueMuted : ''}`}
          >
            {detail.altitude > 0 ? formatDegrees(detail.altitude, 0) : 'pod horyzontem'}
          </span>
        )}
        <ScoreBar visibility={detail.visibility} />
      </span>
    </button>
  );
}

/** Nagłówek wewnątrz sekcji, oddzielający grupy pozycji. */
export function GroupTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <p className={styles.groupTitle}>
      <span>{children}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </p>
  );
}
