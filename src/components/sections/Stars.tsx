import { useDeferredValue, useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Field, Segmented } from '@/components/ui';
import { fold } from '@/lib/catalog/locations';
import { formatLightYears, formatMagnitude, formatNumber } from '@/lib/format';
import { resolveStar } from '@/lib/objects';
import { useSkyContext } from '@/state/useSkyContext';

import { ObjectRow, type SectionProps } from './shared';
import styles from './sections.module.css';

type Filter = 'all' | 'visible' | 'named';

/* Klasy widmowe uporządkowane od najgorętszych do najchłodniejszych. */
const SPECTRAL_ORDER = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;

export function StarsSection({ onClose, catalog }: SectionProps) {
  const ctx = useSkyContext(catalog);
  const [filter, setFilter] = useState<Filter>('visible');
  const [spectral, setSpectral] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  /*
   * Ograniczamy listę do gwiazd jaśniejszych niż czwarta wielkość powiększonej o zapas.
   * Pokazywanie wszystkich ośmiu tysięcy nie miałoby wartości: użytkownik szuka
   * gwiazd, które potrafi rozpoznać na niebie, a nie pozycji katalogowych.
   */
  const base = useMemo(
    () => catalog.named.filter((s) => s.mag <= 4.2).sort((a, b) => a.mag - b.mag),
    [catalog],
  );

  const details = useMemo(() => {
    const q = fold(deferredQuery);
    return base
      .filter((star) => {
        if (spectral && star.spectClass !== spectral) return false;
        if (filter === 'named' && !star.nameIau) return false;
        if (q.length >= 2) {
          const haystack = fold(
            [star.name, star.nameIau, star.bayerPl, star.conPl, star.alt?.join(' ')]
              .filter(Boolean)
              .join(' '),
          );
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .map((star) => resolveStar(star, ctx))
      .filter((d) => (filter === 'visible' ? d.altitude > 0 : true))
      .sort((a, b) =>
        filter === 'visible'
          ? b.visibility.score - a.visibility.score
          : (a.magnitude ?? 9) - (b.magnitude ?? 9),
      );
  }, [base, ctx, filter, spectral, deferredQuery]);

  return (
    <Panel
      eyebrow="Najjaśniejsze gwiazdy nieba"
      title="Gwiazdy"
      onClose={onClose}
      photoKey="scene:milky-way"
    >
      <div className={styles.stack}>
        <Field
          label="Szukaj gwiazdy"
          hideLabel
          placeholder="Nazwa, oznaczenie Bayera albo gwiazdozbiór"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className={styles.filters}>
          <Segmented
            label="Zakres listy"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'visible', label: 'Nad horyzontem' },
              { value: 'named', label: 'Z nazwą' },
              { value: 'all', label: 'Wszystkie' },
            ]}
          />
          <span className={styles.count}>{formatNumber(details.length)}</span>
        </div>

        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chipButton} ${spectral === null ? styles.chipButtonActive : ''}`}
            onClick={() => setSpectral(null)}
          >
            wszystkie typy
          </button>
          {SPECTRAL_ORDER.map((cls) => (
            <button
              key={cls}
              type="button"
              className={`${styles.chipButton} ${spectral === cls ? styles.chipButtonActive : ''}`}
              onClick={() => setSpectral(spectral === cls ? null : cls)}
              title={`Klasa widmowa ${cls}`}
            >
              {cls}
            </button>
          ))}
        </div>

        {details.length === 0 ? (
          <p className={styles.hint}>
            Żadna gwiazda nie spełnia tych kryteriów. Poszerz zakres albo wyczyść filtr typu widmowego.
          </p>
        ) : (
          <div className={styles.list}>
            {details.slice(0, 160).map((detail) => (
              <ObjectRow
                key={`${detail.name}-${detail.ra}`}
                detail={detail}
                icon="star"
                subtitle={[
                  detail.constellation,
                  detail.magnitude !== null ? `${formatMagnitude(detail.magnitude)} mag` : null,
                  detail.distanceLy !== null ? formatLightYears(detail.distanceLy) : null,
                ]
                  .filter(Boolean)
                  .join(' , ')}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
