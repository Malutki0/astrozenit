import { useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Segmented, Stat } from '@/components/ui';
import { ALL_BODY_KEYS, BODY_PROFILES } from '@/lib/astro/constants';
import { formatAu, formatKm, formatMagnitude, formatTime } from '@/lib/format';
import { resolveBody } from '@/lib/objects';
import { useSkyContext } from '@/state/useSkyContext';

import { ObjectRow, type SectionProps } from './shared';
import styles from './sections.module.css';

type Sort = 'visibility' | 'distance' | 'order';

/*
 * Kolejność od Słońca, używana przy sortowaniu według układu.
 * Słońce i Księżyc stoją na początku, bo w praktyce obserwacyjnej
 * to od nich zależy, czy cokolwiek innego da się zobaczyć.
 */
const ORDER = ALL_BODY_KEYS;

export function PlanetsSection({ onClose, catalog }: SectionProps) {
  const ctx = useSkyContext(catalog);
  const [sort, setSort] = useState<Sort>('visibility');

  const details = useMemo(() => {
    const list = ORDER.map((key) => resolveBody(key, ctx));
    if (sort === 'visibility') {
      return [...list].sort((a, b) => b.visibility.score - a.visibility.score);
    }
    if (sort === 'distance') {
      return [...list].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
    return list;
  }, [ctx, sort]);

  const summary = useMemo(() => {
    const visible = details.filter((d) => d.altitude > 0 && d.ref.kind === 'body');
    return { visible: visible.length, total: details.length };
  }, [details]);

  return (
    <Panel
      eyebrow={`${summary.visible} z ${summary.total} nad horyzontem`}
      title="Planety"
      onClose={onClose}
      photoKey="scene:planets"
    >
      <div className={styles.stack}>
        <div className={styles.filters}>
          <Segmented
            label="Sortowanie"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'visibility', label: 'Widoczność' },
              { value: 'distance', label: 'Odległość' },
              { value: 'order', label: 'Układ' },
            ]}
          />
        </div>

        <div className={styles.list}>
          {details.map((detail) => (
            <ObjectRow
              key={detail.name}
              detail={detail}
              icon={detail.name === 'Księżyc' ? 'moon' : 'planet'}
              subtitle={[
                /* Sama nazwa gwiazdozbioru, bez wstępu. Wiersz ma na drugą linię
                 * około trzydziestu znaków, a "w gwiazdozbiorze:" zjadało połowę
                 * z nich, przez co jasność i odległość nie mieściły się już wcale. */
                detail.constellation,
                detail.magnitude !== null ? `${formatMagnitude(detail.magnitude)} mag` : null,
              ]
                .filter(Boolean)
                .join(' , ')}
            />
          ))}
        </div>

        <div className={styles.divider} />

        {details
          .filter((d) => d.ref.kind === 'body' && d.altitude > -10)
          .slice(0, 3)
          .map((detail) => {
            const key = detail.ref.kind === 'body' ? detail.ref.key : null;
            const profile = key ? BODY_PROFILES[key] : null;
            return (
              <div key={`karta-${detail.name}`}>
                <p className={styles.sectionTitle}>{detail.name}</p>
                <div className={styles.grid}>
                  <Stat label="Wschód" value={formatTime(detail.riseSet.rise)} />
                  <Stat label="Górowanie" value={formatTime(detail.riseSet.transit)} />
                  <Stat label="Zachód" value={formatTime(detail.riseSet.set)} />
                  {detail.distanceKm !== null && (
                    <>
                      <Stat label="Odległość" value={formatKm(detail.distanceKm)} />
                      <Stat
                        label="W jednostkach"
                        value={formatAu(detail.distanceKm / 149597870.7)}
                      />
                    </>
                  )}
                </div>
                {profile && <p className={styles.hint}>{profile.summary}</p>}
              </div>
            );
          })}
      </div>
    </Panel>
  );
}
