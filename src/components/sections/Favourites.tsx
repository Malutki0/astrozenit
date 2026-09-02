import { useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { EmptyState, Icon, PhotoThumb } from '@/components/ui';
import { PlanetGlobe } from '@/components/panels/PlanetGlobe';
import type { BodyKey } from '@/lib/astro/types';
import { formatDate } from '@/lib/format';
import { usePhotos } from '@/state/usePhotos';
import { useAuthStore } from '@/state/useAuth';
import { useFavouritesStore, LIMIT, type Favourite } from '@/state/useFavourites';
import { useSkyStore } from '@/state/useSkyStore';
import type { SkyObjectRef } from '@/lib/render/types';

import type { SectionProps } from './shared';
import styles from './sections.module.css';

/*
 * LISTA OBSERWACYJNA
 *
 * Sekcja dostępna po zalogowaniu. Nie jest to spis rzeczy ulubionych w sensie
 * upodobania, tylko lista rzeczy do zobaczenia i już zobaczonych, bo tak się
 * z niej korzysta: przed wyjściem sprawdza się, co dziś jest wysoko, a po powrocie
 * odhacza się to, co udało się znaleźć.
 *
 * Stąd dwie rzeczy, których nie ma w zwykłych ulubionych: znacznik zaobserwowania
 * i miejsce na notatkę. Notatka jest tu najczęściej używaną funkcją takiej listy,
 * bo przy obiekcie trzeba pamiętać, czym się go oglądało i przy jakim powiększeniu.
 */

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

/** Zamienia zapis tekstowy z listy z powrotem na odwołanie do obiektu. */
function naOdwolanie(ref: string): SkyObjectRef | null {
  const [rodzaj, reszta] = ref.split(':');
  if (!reszta) return null;
  if (rodzaj === 'star') return { kind: 'star', hip: Number(reszta), index: -1 };
  if (rodzaj === 'body') return { kind: 'body', key: reszta as BodyKey };
  if (rodzaj === 'dso') return { kind: 'dso', id: reszta };
  if (rodzaj === 'constellation') return { kind: 'constellation', id: reszta };
  if (rodzaj === 'asterism') return { kind: 'asterism', id: reszta };
  if (rodzaj === 'satellite') return { kind: 'satellite', id: Number(reszta) };
  return null;
}

function Miniatura({ item }: { item: Favourite }) {
  const photos = usePhotos();
  const photo = photos[item.ref];
  if (photo) {
    return (
      <span className={styles.rowPhoto}>
        <PhotoThumb photo={photo} alt={item.label} size={40} />
      </span>
    );
  }
  const [rodzaj, klucz] = item.ref.split(':');
  if (rodzaj === 'body' && MA_MAPE.has(klucz as BodyKey)) {
    return (
      <span className={styles.rowGlobe}>
        <PlanetGlobe body={klucz as BodyKey} size={38} still locked />
      </span>
    );
  }
  return <Icon name={rodzaj === 'star' ? 'star' : 'sparkle'} size={17} className={styles.rowIcon} />;
}

export function FavouritesSection({ onClose }: SectionProps) {
  const session = useAuthStore((s) => s.session);
  const items = useFavouritesStore((s) => s.items);
  const remove = useFavouritesStore((s) => s.remove);
  const setObserved = useFavouritesStore((s) => s.setObserved);
  const setNote = useFavouritesStore((s) => s.setNote);
  const select = useSkyStore((s) => s.select);
  const [edytowana, setEdytowana] = useState<string | null>(null);

  /*
   * Do zobaczenia na górze, zobaczone na dole. Lista służy przede wszystkim
   * planowaniu, więc to, co jeszcze przed nami, ma być pierwsze pod ręką.
   */
  const { doZobaczenia, zobaczone } = useMemo(
    () => ({
      doZobaczenia: items.filter((i) => i.observedAt === null),
      zobaczone: items.filter((i) => i.observedAt !== null),
    }),
    [items],
  );

  if (!session) {
    return (
      <Panel eyebrow="Twoja lista" title="Ulubione" onClose={onClose}>
        <EmptyState title="Lista obserwacyjna wymaga konta">
          Zapisane obiekty są przypisane do konta, żeby ta sama lista była dostępna
          na telefonie i na komputerze. Zaloguj się w sekcji Konto, a lista pojawi się tutaj.
        </EmptyState>
      </Panel>
    );
  }

  const wiersz = (item: Favourite) => (
    <div key={item.ref} className={styles.row}>
      <Miniatura item={item} />
      <button
        type="button"
        className={styles.rowMain}
        style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }}
        onClick={() => {
          const ref = naOdwolanie(item.ref);
          if (ref) select(ref);
        }}
      >
        <span className={styles.rowTitle}>{item.label}</span>
        <span className={styles.rowSub}>
          {item.kind}
          {item.observedAt ? ` , zobaczone ${formatDate(new Date(item.observedAt))}` : ''}
        </span>
        {item.note && <span className={styles.rowNote}>{item.note}</span>}
      </button>
      <span className={styles.rowNumbers}>
        <button
          type="button"
          className={styles.chipButton}
          onClick={() => setObserved(item.ref, item.observedAt === null)}
          title={item.observedAt ? 'Cofnij oznaczenie' : 'Oznacz jako zaobserwowane'}
        >
          <Icon name={item.observedAt ? 'check' : 'eye'} size={15} />
        </button>
        <button
          type="button"
          className={styles.chipButton}
          onClick={() => setEdytowana(edytowana === item.ref ? null : item.ref)}
          title="Notatka"
        >
          <Icon name="info" size={15} />
        </button>
        <button
          type="button"
          className={styles.chipButton}
          onClick={() => remove(item.ref)}
          title="Usuń z listy"
        >
          <Icon name="close" size={15} />
        </button>
      </span>

      {edytowana === item.ref && (
        <textarea
          className={styles.noteField}
          defaultValue={item.note ?? ''}
          placeholder="Czym oglądać, przy jakim powiększeniu, na co zwrócić uwagę"
          rows={3}
          maxLength={2000}
          onBlur={(e) => {
            setNote(item.ref, e.target.value.trim() || null);
            setEdytowana(null);
          }}
        />
      )}
    </div>
  );

  return (
    <Panel
      eyebrow={`${items.length} z ${LIMIT}`}
      title="Ulubione"
      onClose={onClose}
      photoKey="scene:milky-way"
    >
      <div className={styles.stack}>
        <p className={styles.lead}>
          Obiekty zapisane do obejrzenia. Dodasz je przyciskiem gwiazdki w panelu obiektu,
          po wybraniu czegokolwiek na mapie. Po obserwacji odhacz pozycję: lista działa
          wtedy i jako plan, i jako dziennik tego, co się już widziało.
        </p>

        {items.length === 0 ? (
          <EmptyState title="Lista jest pusta">
            Wybierz cokolwiek na mapie nieba albo w spisie planet czy gwiazd, a w panelu
            obiektu pojawi się przycisk dodania do listy.
          </EmptyState>
        ) : (
          <>
            {doZobaczenia.length > 0 && (
              <div>
                <p className={styles.sectionTitle}>Do zobaczenia</p>
                <div className={styles.list}>{doZobaczenia.map(wiersz)}</div>
              </div>
            )}

            {zobaczone.length > 0 && (
              <div>
                <p className={styles.sectionTitle}>Zobaczone</p>
                <div className={styles.list}>{zobaczone.map(wiersz)}</div>
              </div>
            )}
          </>
        )}

        {items.length >= LIMIT && (
          <p className={styles.hint}>
            Lista osiągnęła limit {LIMIT} pozycji. Usuń coś, żeby dodać nowy obiekt.
          </p>
        )}

        <div className={styles.divider} />

        <p className={styles.hint}>
          Lista jest dziś zapisywana w tej przeglądarce, osobno dla każdego konta.
          Po uruchomieniu serwera przeniesie się na zaplecze i będzie dostępna na
          każdym urządzeniu, na którym się zalogujesz. Kształt danych jest już taki,
          jakiego wymaga tabela na serwerze, więc przeniesienie niczego nie zgubi.
        </p>
      </div>
    </Panel>
  );
}
