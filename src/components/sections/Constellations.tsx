import { useDeferredValue, useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Field, Segmented } from '@/components/ui';
import { fold } from '@/lib/catalog/locations';
import type { Asterism, ConstellationRecord } from '@/lib/catalog/types';
import { formatMagnitude, formatNumber } from '@/lib/format';
import { resolveAsterism, resolveConstellation, type ObjectDetail } from '@/lib/objects';
import { useSkyContext } from '@/state/useSkyContext';
import { useSkyStore } from '@/state/useSkyStore';

import { ScoreBar, type SectionProps } from './shared';
import styles from './sections.module.css';

type Scope = 'visible' | 'all' | 'asterisms';

/**
 * Miniatura figury.
 *
 * Rysujemy prawdziwe linie gwiazdozbioru w rzucie prostokątnym wokół jego środka,
 * skalowanym tak, żeby figura wypełniła kadr. Nie jest to obrazek podpięty z zewnątrz,
 * tylko te same dane, które trafiają na mapę nieba, więc kształt zawsze się zgadza.
 */
function FigureThumb({ lines, size = 74 }: { lines: [number, number][][]; size?: number }) {
  const geometry = useMemo(() => {
    const points = lines.flat();
    if (points.length === 0) return null;

    /* Środek liczymy na wektorach, żeby figura przecinająca zero godzin
     * nie rozpadła się na dwie połowy. */
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const [raH, decD] of points) {
      const ra = (raH * 15 * Math.PI) / 180;
      const dec = (decD * Math.PI) / 180;
      sx += Math.cos(dec) * Math.cos(ra);
      sy += Math.cos(dec) * Math.sin(ra);
      sz += Math.sin(dec);
    }
    const n = points.length;
    const centerDec = Math.asin(sz / n / Math.hypot(sx / n, sy / n, sz / n));
    const centerRa = Math.atan2(sy, sx);
    const cosDec = Math.cos(centerDec) || 0.001;

    const projected = lines.map((line) =>
      line.map(([raH, decD]) => {
        let dRa = (raH * 15 * Math.PI) / 180 - centerRa;
        if (dRa > Math.PI) dRa -= 2 * Math.PI;
        if (dRa < -Math.PI) dRa += 2 * Math.PI;
        /* Rektascensja rośnie w lewo, stąd znak minus. */
        return [-dRa * cosDec, (decD * Math.PI) / 180 - centerDec] as [number, number];
      }),
    );

    const flat = projected.flat();
    const xs = flat.map((p) => p[0]);
    const ys = flat.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spread = Math.max(maxX - minX, maxY - minY, 0.001);
    const scale = (size - 14) / spread;
    const offsetX = size / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = size / 2 + ((minY + maxY) / 2) * scale;

    return {
      lines: projected.map((line) =>
        line.map(([x, y]) => [x * scale + offsetX, offsetY - y * scale] as [number, number]),
      ),
    };
  }, [lines, size]);

  if (!geometry) return <span className={styles.thumb} style={{ width: size, height: size }} />;

  return (
    <svg
      className={styles.thumb}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      {geometry.lines.map((line, i) => (
        <polyline
          key={i}
          points={line.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.5"
        />
      ))}
      {geometry.lines.flat().map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.5" fill="currentColor" opacity="0.85" />
      ))}
    </svg>
  );
}

function FigureCard({
  detail,
  lines,
  meta,
}: {
  detail: ObjectDetail;
  lines: [number, number][][];
  meta: string;
}) {
  const select = useSkyStore((s) => s.select);
  const focusOn = useSkyStore((s) => s.focusOn);

  return (
    <button
      type="button"
      className={styles.figureCard}
      onClick={() => {
        select(detail.ref);
        if (detail.altitude > -5) focusOn(detail.azimuth, detail.altitude, 58);
      }}
    >
      <span className={styles.figureThumbWrap}>
        <FigureThumb lines={lines} />
      </span>
      <span className={styles.figureBody}>
        <span className={styles.figureName}>{detail.name}</span>
        <span className={styles.figureMeta}>{meta}</span>
        <ScoreBar visibility={detail.visibility} />
      </span>
    </button>
  );
}

export function ConstellationsSection({ onClose, catalog }: SectionProps) {
  const ctx = useSkyContext(catalog);
  const [scope, setScope] = useState<Scope>('visible');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const items = useMemo(() => {
    const q = fold(deferred);
    const matches = (record: { pl: string; la?: string; en?: string | null }) =>
      q.length < 2 ||
      fold([record.pl, record.la, record.en].filter(Boolean).join(' ')).includes(q);

    if (scope === 'asterisms') {
      return catalog.asterisms
        .filter((a: Asterism) => matches({ pl: a.pl, en: a.en }))
        .map((a) => ({
          detail: resolveAsterism(a, ctx),
          lines: a.lines,
          meta: a.en !== a.pl ? a.en : 'układ zwyczajowy',
        }));
    }

    return catalog.constellations
      .filter((c: ConstellationRecord) => matches(c))
      .map((c) => ({
        detail: resolveConstellation(c, ctx),
        lines: c.lines,
        meta: [
          c.la,
          c.brightest?.name ? `${c.brightest.name} ${formatMagnitude(c.brightest.mag)}` : null,
          c.season,
        ]
          .filter(Boolean)
          .join(' , '),
      }))
      .filter((item) => (scope === 'visible' ? item.detail.altitude > 0 : true))
      .sort((a, b) =>
        scope === 'visible'
          ? b.detail.visibility.score - a.detail.visibility.score
          : a.detail.name.localeCompare(b.detail.name, 'pl'),
      );
  }, [catalog, ctx, scope, deferred]);

  return (
    <Panel
      eyebrow="Figury nieba według Międzynarodowej Unii Astronomicznej"
      title="Konstelacje"
      onClose={onClose}
      wide
      photoKey="scene:constellations"
    >
      <div className={styles.stack}>
        <Field
          label="Szukaj gwiazdozbioru"
          hideLabel
          placeholder="Nazwa polska albo łacińska"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className={styles.filters}>
          <Segmented
            label="Zakres listy"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'visible', label: 'Nad horyzontem' },
              { value: 'all', label: 'Wszystkie 88' },
              { value: 'asterisms', label: 'Asteryzmy' },
            ]}
          />
          <span className={styles.count}>{formatNumber(items.length)}</span>
        </div>

        {items.length === 0 ? (
          <p className={styles.hint}>
            Nic nie pasuje do tego zapytania. Spróbuj innej nazwy albo przełącz zakres na wszystkie.
          </p>
        ) : (
          <div className={styles.figureGrid}>
            {items.map((item) => (
              <FigureCard
                key={item.detail.name}
                detail={item.detail}
                lines={item.lines}
                meta={item.meta}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
