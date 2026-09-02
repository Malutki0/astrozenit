import { useEffect, useRef, type ReactNode } from 'react';

import { IconButton } from '@/components/ui';
import { usePhotos } from '@/state/usePhotos';
import styles from './AppShell.module.css';

interface PanelProps {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sekcje z gęstą treścią, jak kalendarz, dostają szerszy panel. */
  wide?: boolean;
  actions?: ReactNode;
  side?: 'left' | 'right';
  /**
   * Klucz zdjęcia, które ma stanąć za nagłówkiem. Sekcja bez klucza albo z kluczem,
   * dla którego nie ma zdjęcia na wolnej licencji, wygląda dokładnie tak jak dotąd.
   */
  photoKey?: string;
}

/**
 * Panel unoszący się nad mapą nieba.
 *
 * Zamyka się klawiszem Escape i przy montowaniu przenosi fokus na siebie,
 * więc korzystanie z klawiatury nie wymaga przechodzenia przez całą mapę.
 * Nie odbieramy fokusu reszcie strony, bo mapa ma pozostać dostępna: użytkownik
 * może przeglądać listę i jednocześnie patrzeć, gdzie na niebie leży obiekt.
 */
export function Panel({
  eyebrow,
  title,
  onClose,
  children,
  wide,
  actions,
  side = 'left',
  photoKey,
}: PanelProps) {
  const ref = useRef<HTMLElement>(null);
  const photos = usePhotos();
  const photo = photoKey ? photos[photoKey] : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      className={`${side === 'right' ? styles.detail : styles.panel} ${wide ? styles.panelWide : ''}`}
    >
      <span className={styles.panelHeaderHandle} aria-hidden="true" />
      <header className={`${styles.panelHeader} ${photo ? styles.panelHeaderOverPhoto : ''}`}>
        {/*
          * Pas fotograficzny wypełnia nagłówek, a nie stały wycinek panelu.
          * Wersja o stałej wysokości wchodziła w treść pod nagłówkiem, przez co
          * podpis autora lądował na pierwszym akapicie, a akapit na zdjęciu.
          * Powiązanie z nagłówkiem daje pas dokładnie tej wysokości, jaką ma
          * tytuł, niezależnie od długości nadtytułu i liczby przycisków obok.
          *
          * Podpis autora i licencji stoi w rogu pasa. Jest drobny, ale musi tu być:
          * bez niego wyświetlanie tego zdjęcia łamałoby warunki jego licencji.
          */}
        {photo && (
          <span className={styles.panelPhoto} aria-hidden="true">
            <img src={photo.src} alt="" loading="lazy" decoding="async" />
            <span className={styles.panelPhotoCredit}>
              {photo.autor}, {photo.licencja}
            </span>
          </span>
        )}
        <div className={styles.panelTitleGroup}>
          {eyebrow && <span className={styles.panelEyebrow}>{eyebrow}</span>}
          <h1 className={styles.panelTitle}>{title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flex: 'none' }}>
          {actions}
          <IconButton icon="close" label="Zamknij panel" onClick={onClose} />
        </div>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
