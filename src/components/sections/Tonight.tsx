import { useMemo } from 'react';

import { Panel } from '@/components/shell/Panel';
import { PlanetVisibility } from '@/components/panels/PlanetVisibility';
import { Chip, Stat } from '@/components/ui';
import { PLANET_KEYS } from '@/lib/astro/constants';
import { formatDuration, formatTime } from '@/lib/format';
import { resolveBody, resolveDso, resolveStar, type ObjectDetail } from '@/lib/objects';
import { useSkyContext } from '@/state/useSkyContext';

import { GroupTitle, ObjectRow, type SectionProps } from './shared';
import styles from './sections.module.css';

/**
 * Sekcja "Dziś w nocy".
 *
 * Odpowiada na jedno pytanie: co warto dziś obejrzeć z tego miejsca.
 * Zamiast wypisywać wszystko, przepuszcza katalog przez ocenę warunków
 * i pokazuje wyłącznie to, co jest realnie osiągalne.
 */
export function TonightSection({ onClose, catalog }: SectionProps) {
  const ctx = useSkyContext(catalog);
  const { night, location } = ctx;

  const picks = useMemo(() => {
    const out: { detail: ObjectDetail; group: string }[] = [];

    for (const key of PLANET_KEYS) {
      const detail = resolveBody(key, ctx);
      if (detail.visibility.score >= 30) out.push({ detail, group: 'Planety' });
    }

    const moon = resolveBody('moon', ctx);
    if (moon.altitude > 0) out.push({ detail: moon, group: 'Planety' });

    /* Z katalogu Messiera bierzemy tylko obiekty realnie osiągalne z tego miejsca,
     * z uwzględnieniem zanieczyszczenia nieba światłem. */
    for (const dso of catalog.dso) {
      if (dso.mag === null || dso.mag > 9) continue;
      const detail = resolveDso(dso, ctx);
      if (detail.visibility.score >= 45) out.push({ detail, group: 'Obiekty głębokiego nieba' });
    }

    /* Gwiazdy tylko najjaśniejsze, żeby lista nie zamieniła się w katalog. */
    for (const star of catalog.named) {
      if (star.mag > 1.6 || !star.name) continue;
      const detail = resolveStar(star, ctx);
      if (detail.visibility.score >= 55) out.push({ detail, group: 'Jasne gwiazdy' });
    }

    out.sort((a, b) => b.detail.visibility.score - a.detail.visibility.score);
    return out;
  }, [ctx, catalog]);

  const groups = ['Planety', 'Obiekty głębokiego nieba', 'Jasne gwiazdy'];
  const total = picks.length;

  return (
    <Panel
      eyebrow={location.label}
      title="Dziś w nocy"
      onClose={onClose}
      wide
      photoKey="scene:aurora"
    >
      <div className={styles.stack}>
        <div>
          <p className={styles.sectionTitle}>Okno ciemności</p>
          <div className={styles.grid}>
            <Stat label="Zachód" value={formatTime(night.sunset)} />
            <Stat label="Zmierzch" value={formatTime(night.astronomicalDusk)} />
            <Stat label="Świt" value={formatTime(night.astronomicalDawn)} />
            <Stat label="Wschód" value={formatTime(night.sunrise)} />
          </div>
          <p className={styles.hint}>
            {night.darkMinutes !== null
              ? `Prawdziwa ciemność trwa ${formatDuration(night.darkMinutes)}. To okno, w którym widać najsłabsze obiekty.`
              : 'Tej nocy Słońce nie schodzi osiemnaście stopni pod horyzont, więc noc astronomiczna nie zapada. To normalne w Polsce od maja do sierpnia.'}
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Kiedy co jest nad horyzontem</p>
          <PlanetVisibility />
        </div>

        <div className={styles.divider} />

        {total === 0 ? (
          <div>
            <Chip tone="down" dot>
              Brak obiektów spełniających kryteria
            </Chip>
            <p className={styles.hint}>
              O tej porze niebo jest zbyt jasne albo interesujące obiekty są pod horyzontem.
              Przesuń oś czasu na środek nocy, żeby zobaczyć pełną listę.
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const items = picks.filter((p) => p.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <GroupTitle count={items.length}>{group}</GroupTitle>
                <div className={styles.list}>
                  {items.slice(0, group === 'Obiekty głębokiego nieba' ? 14 : 12).map((item) => (
                    <ObjectRow
                      key={`${item.detail.name}-${item.detail.ra}`}
                      detail={item.detail}
                      icon={
                        item.detail.name === 'Księżyc'
                          ? 'moon'
                          : group === 'Planety'
                            ? 'planet'
                            : group === 'Jasne gwiazdy'
                              ? 'star'
                              : 'sparkle'
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
