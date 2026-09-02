import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@/components/ui';
import { ALL_BODY_KEYS, BODY_PROFILES } from '@/lib/astro/constants';
import { fold } from '@/lib/catalog/locations';
import type { CatalogBundle } from '@/lib/catalog/types';
import { formatDegrees, formatMagnitude } from '@/lib/format';
import type { SkyObjectRef } from '@/lib/render/types';
import { resolveRef } from '@/lib/objects';
import { useSkyContext } from '@/state/useSkyContext';
import { useSkyStore } from '@/state/useSkyStore';

import styles from './CommandPalette.module.css';

interface Candidate {
  ref: SkyObjectRef;
  /** Nazwa pokazywana użytkownikowi. */
  label: string;
  /** Wiersz opisu pod nazwą. */
  meta: string;
  icon: IconName;
  group: string;
  /** Wszystkie warianty nazwy, po których można trafić w ten obiekt. */
  keys: string;
  /** Waga bazowa, żeby planety i jasne gwiazdy wygrywały remisy. */
  weight: number;
}

/*
 * Indeks wyszukiwania budujemy raz na katalog.
 * Zawiera nazwy polskie, międzynarodowe, oznaczenia Bayera i Flamsteeda,
 * numery katalogowe oraz nazwy łacińskie, wszystko w postaci bez znaków
 * diakrytycznych, żeby wpisanie "labedz" trafiało w Łabędzia.
 */
function buildIndex(catalog: CatalogBundle): Candidate[] {
  const out: Candidate[] = [];

  for (const key of ALL_BODY_KEYS) {
    const profile = BODY_PROFILES[key];
    out.push({
      ref: { kind: 'body', key },
      label: profile.name,
      meta: profile.kind === 'planet' ? 'planeta' : profile.kind === 'moon' ? 'satelita Ziemi' : 'gwiazda',
      icon: key === 'moon' ? 'moon' : 'planet',
      group: 'Układ Słoneczny',
      keys: fold(`${profile.name} ${profile.genitive} ${key}`),
      weight: 100,
    });
  }

  for (const star of catalog.named) {
    if (!star.name && star.mag > 3.6) continue;
    const designation =
      star.bayerPl && star.conGen ? `${star.bayerPl} ${star.conGen}` : star.hip ? `HIP ${star.hip}` : '';
    out.push({
      ref: { kind: 'star', hip: star.hip ?? 0, index: -1 },
      label: star.name ?? designation,
      meta: [designation !== star.name ? designation : null, star.conPl, `${formatMagnitude(star.mag)} mag`]
        .filter(Boolean)
        .join(' , '),
      icon: 'star',
      group: 'Gwiazdy',
      keys: fold(
        [star.name, star.nameIau, star.alt?.join(' '), designation, star.bayer, star.conPl, star.hip ? `hip${star.hip}` : '']
          .filter(Boolean)
          .join(' '),
      ),
      weight: 60 - star.mag * 6,
    });
  }

  for (const dso of catalog.dso) {
    out.push({
      ref: { kind: 'dso', id: dso.id },
      label: dso.name === dso.id ? dso.id : `${dso.name}`,
      meta: [dso.id, dso.ngc, dso.typePl, dso.conPl].filter(Boolean).join(' , '),
      icon: 'sparkle',
      group: 'Obiekty głębokiego nieba',
      keys: fold([dso.id, dso.ngc, dso.name, dso.nameEn, dso.typePl, dso.conPl].filter(Boolean).join(' ')),
      weight: 40,
    });
  }

  for (const con of catalog.constellations) {
    out.push({
      ref: { kind: 'constellation', id: con.id },
      label: con.pl,
      meta: [con.la, con.season].filter(Boolean).join(' , '),
      icon: 'constellation',
      group: 'Gwiazdozbiory',
      keys: fold([con.pl, con.la, con.en, con.gen, con.id].filter(Boolean).join(' ')),
      weight: 50,
    });
  }

  for (const ast of catalog.asterisms) {
    out.push({
      ref: { kind: 'asterism', id: ast.id },
      label: ast.pl,
      meta: `asteryzm , ${ast.en}`,
      icon: 'constellation',
      group: 'Asteryzmy',
      keys: fold(`${ast.pl} ${ast.en}`),
      weight: 45,
    });
  }

  return out;
}

const GROUP_ORDER = [
  'Układ Słoneczny',
  'Gwiazdy',
  'Gwiazdozbiory',
  'Asteryzmy',
  'Obiekty głębokiego nieba',
];

export function CommandPalette({
  catalog,
  onClose,
}: {
  catalog: CatalogBundle;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const select = useSkyStore((s) => s.select);
  const focusOn = useSkyStore((s) => s.focusOn);
  const ctx = useSkyContext(catalog);

  const index = useMemo(() => buildIndex(catalog), [catalog]);

  const results = useMemo(() => {
    const q = fold(deferred);
    if (q.length < 2) return [];
    const scored: { candidate: Candidate; score: number }[] = [];
    for (const candidate of index) {
      const position = candidate.keys.indexOf(q);
      if (position === -1) continue;
      let score = candidate.weight;
      if (fold(candidate.label) === q) score += 900;
      else if (fold(candidate.label).startsWith(q)) score += 500;
      else if (position === 0) score += 300;
      else if (candidate.keys[position - 1] === ' ') score += 160;
      scored.push({ candidate, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 24).map((s) => s.candidate);
  }, [index, deferred]);

  useEffect(() => setActive(0), [deferred]);
  useEffect(() => inputRef.current?.focus(), []);

  /* Aktywny wynik trzymamy w polu widzenia przy nawigacji klawiaturą. */
  useEffect(() => {
    const node = listRef.current?.querySelector('[aria-selected="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (candidate: Candidate) => {
    const detail = resolveRef(candidate.ref, ctx);
    select(candidate.ref);
    if (detail && detail.altitude > -5) {
      focusOn(detail.azimuth, detail.altitude, candidate.ref.kind === 'constellation' ? 58 : 24);
    }
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  };

  /* Wyniki grupujemy dopiero na wyjściu, żeby kolejność w obrębie grupy
   * pozostała zgodna z oceną trafności. */
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: results.filter((r) => r.group === group),
  })).filter((g) => g.items.length > 0);

  let counter = -1;

  return (
    <div className={styles.backdrop} onPointerDown={onClose} role="presentation">
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Wyszukiwarka obiektów nieba"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={styles.inputRow}>
          <Icon name="search" size={17} className={styles.inputIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj gwiazdy, planety, mgławicy albo gwiazdozbioru"
            aria-label="Szukaj obiektu na niebie"
            aria-autocomplete="list"
            aria-controls="wyniki-wyszukiwania"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.esc}>Esc</kbd>
        </div>

        <div className={styles.results} id="wyniki-wyszukiwania" role="listbox" ref={listRef}>
          {query.length < 2 ? (
            <p className={styles.placeholder}>
              Wpisz co najmniej dwa znaki. Działają nazwy polskie i międzynarodowe, oznaczenia
              Bayera, numery katalogu Messiera oraz numery HIP. Znaki diakrytyczne nie są wymagane.
            </p>
          ) : results.length === 0 ? (
            <p className={styles.placeholder}>
              Brak wyników dla „{query}”. Sprawdź pisownię albo spróbuj nazwy międzynarodowej.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.group}>
                <p className={styles.groupLabel}>{group.group}</p>
                {group.items.map((candidate) => {
                  counter++;
                  const isActive = counter === active;
                  const detail = isActive ? resolveRef(candidate.ref, ctx) : null;
                  return (
                    <button
                      key={`${candidate.group}-${candidate.label}-${counter}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`${styles.result} ${isActive ? styles.resultActive : ''}`}
                      onClick={() => choose(candidate)}
                      onMouseEnter={() => setActive(counter)}
                    >
                      <Icon name={candidate.icon} size={16} className={styles.resultIcon} />
                      <span className={styles.resultMain}>
                        <span className={styles.resultLabel}>{candidate.label}</span>
                        <span className={styles.resultMeta}>{candidate.meta}</span>
                      </span>
                      {detail && (
                        <span className={styles.resultValue}>
                          {detail.altitude > 0 ? formatDegrees(detail.altitude, 0) : 'pod horyzontem'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span>
            <kbd className={styles.key}>↑</kbd>
            <kbd className={styles.key}>↓</kbd> wybór
          </span>
          <span>
            <kbd className={styles.key}>Enter</kbd> pokaż na mapie
          </span>
          <span className={styles.footerCount}>
            {results.length > 0 ? `${results.length} wyników` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
