import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Chip, Field, Icon, Stat } from '@/components/ui';
import { SUGGESTED_LOCATIONS } from '@/lib/astro/constants';
import type { GeoLocation } from '@/lib/astro/types';
import {
  bortleInfo,
  fold,
  loadLocations,
  searchLocations,
  toGeoLocation,
  type LocationEntry,
} from '@/lib/catalog/locations';
import { formatNumber } from '@/lib/format';
import { useGeolocation } from '@/state/useGeolocation';
import { TileMap } from '@/components/map/TileMap';
import { useSkyStore } from '@/state/useSkyStore';

import styles from './LocationPicker.module.css';

/** Kolor kropki przy podpowiedzi: im ciemniejsze niebo, tym chłodniejszy odcień. */
const bortleColor = (value: number) =>
  value <= 3 ? 'var(--signal-visible)' : value <= 5 ? 'var(--accent)' : 'var(--signal-down)';

function BortleMeter({ value }: { value: number | null }) {
  const info = bortleInfo(value);
  const level = value ?? 6;
  return (
    <span className={styles.bortle} title={`Skala Bortle'a ${level}: ${info.label}`}>
      <span className={styles.bortleBars} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={`${styles.bar} ${i < level ? (level <= 3 ? styles.barDark : styles.barOn) : ''}`}
            style={{ height: `${5 + i * 1.1}px` }}
          />
        ))}
      </span>
      <span className={styles.bortleValue}>{level}</span>
    </span>
  );
}

/** Podświetla w nazwie fragment, który pasuje do wpisanego zapytania. */
function Highlight({ text, query }: { text: string; query: string }) {
  const folded = fold(text);
  const q = fold(query);
  const index = q.length >= 2 ? folded.indexOf(q) : -1;
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <span className={styles.match}>{text.slice(index, index + q.length)}</span>
      {text.slice(index + q.length)}
    </>
  );
}

export function LocationPicker() {
  const location = useSkyStore((s) => s.location);
  const setLocation = useSkyStore((s) => s.setLocation);
  const geo = useGeolocation();

  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<LocationEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [manual, setManual] = useState({ lat: '', lon: '' });
  const [manualError, setManualError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Widok mapy. Trzymany osobno od miejsca obserwacji, bo można przesuwać mapę
   * bez zmieniania miejsca, a wskazanie pinezki jest osobną, świadomą decyzją. */
  const [mapView, setMapView] = useState({ lat: location.lat, lon: location.lon, zoom: 8 });
  /* Podążanie mapy za zmianą miejsca wybraną gdzie indziej, na przykład z listy. */
  useEffect(() => {
    setMapView((v) => ({ ...v, lat: location.lat, lon: location.lon }));
  }, [location.lat, location.lon]);

  /* Bazę miejsc wczytujemy dopiero tutaj, bo waży kilkaset kilobajtów
   * i nie jest potrzebna do narysowania nieba. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLocations()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () => (entries ? searchLocations(entries, query) : []),
    [entries, query],
  );

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (entry: LocationEntry) => {
    setLocation(toGeoLocation(entry));
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  /*
   * Punkt geograficzny na miejsce obserwacji.
   *
   * Wysokość nad poziomem morza i stopień zanieczyszczenia nieba światłem bierzemy
   * z najbliższego znanego miejsca z własnej bazy, o ile leży dostatecznie blisko.
   * Nie pytamy o to żadnej usługi zewnętrznej: baza czterech tysięcy miejsc jest już
   * w aplikacji, a przy wskazaniu punktu na mapie i tak chodzi o przybliżenie.
   *
   * Próg to około trzydziestu kilometrów. Dalej zanieczyszczenie nieba potrafi się
   * zmienić o cały stopień skali, więc lepiej przyznać się do niewiedzy i przyjąć
   * wartość przeciętną, niż podstawić dane z odległego miasta.
   */
  const describePoint = (lat: number, lon: number): GeoLocation => {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const near = entries?.length
      ? entries.reduce<{ entry: LocationEntry; km: number } | null>((best, e) => {
          const dy = (e.lat - lat) * 111;
          const dx = (e.lon - lon) * 111 * cosLat;
          const km = Math.hypot(dx, dy);
          return !best || km < best.km ? { entry: e, km } : best;
        }, null)
      : null;
    const close = near && near.km < 30 ? near : null;
    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      elevation: close ? close.entry.elevation : 100,
      label: close
        ? `${Math.round(close.km)} km od ${close.entry.name}`
        : `${formatNumber(lat, 3)} , ${formatNumber(lon, 3)}`,
      source: 'manual',
      bortle: close ? (close.entry.bortle ?? 6) : 6,
      timezone: null,
      region: close ? close.entry.region : null,
    };
  };

  const pickOnMap = (lat: number, lon: number) => {
    setManualError(null);
    setLocation(describePoint(lat, lon));
  };

  const applyManual = () => {
    const lat = Number(manual.lat.replace(',', '.'));
    const lon = Number(manual.lon.replace(',', '.'));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Szerokość musi mieścić się między -90 a 90 stopni.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setManualError('Długość musi mieścić się między -180 a 180 stopni.');
      return;
    }
    setManualError(null);
    setLocation(describePoint(lat, lon));
  };

  const info = bortleInfo(location.bortle);

  return (
    <div className={styles.root}>
      <div className={styles.current}>
        <div className={styles.currentTop}>
          <div style={{ minWidth: 0 }}>
            <p className={styles.currentName}>{location.label}</p>
            <p className={styles.currentCoords}>
              {formatNumber(Math.abs(location.lat), 4)} {location.lat >= 0 ? 'N' : 'S'} ,{' '}
              {formatNumber(Math.abs(location.lon), 4)} {location.lon >= 0 ? 'E' : 'W'}
            </p>
          </div>
          <BortleMeter value={location.bortle} />
        </div>
        <div className={styles.grid}>
          <Stat label="Wysokość" value={`${formatNumber(location.elevation)} m`} />
          <Stat label="Niebo" value={info.label} />
          <Stat label="Zasięg oka" value={`${formatNumber(info.limitMag, 1)} mag`} />
        </div>
        <p className={styles.currentNote}>{info.note}</p>
      </div>

      <div>
        <p className={styles.sectionLabel}>Wskaż miejsce na mapie</p>
        <TileMap
          lat={mapView.lat}
          lon={mapView.lon}
          zoom={mapView.zoom}
          onViewChange={setMapView}
          onPick={pickOnMap}
          marker={{ lat: location.lat, lon: location.lon }}
          height={260}
          hint="Kliknij, żeby postawić pinezkę. Przeciągnij, żeby przesunąć mapę."
        />
      </div>

      <div>
        <Field
          label="Szukaj miejscowości"
          placeholder="Wpisz nazwę, na przykład Zakopane"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="lista-lokalizacji"
          aria-autocomplete="list"
          hint={
            loading
              ? 'Wczytuję bazę miejsc...'
              : entries
                ? `Baza obejmuje ${formatNumber(entries.length)} miejsc, w tym obserwatoria astronomiczne.`
                : undefined
          }
        />

        {query.length >= 2 && (
          <div
            id="lista-lokalizacji"
            role="listbox"
            aria-label="Wyniki wyszukiwania miejscowości"
            className={styles.results}
            ref={listRef}
            style={{ marginTop: 'var(--space-3)' }}
          >
            {results.length === 0 && !loading && (
              <p className={styles.status} style={{ padding: 'var(--space-3) var(--space-2)' }}>
                Brak wyników dla „{query}”. Sprawdź pisownię albo wpisz współrzędne poniżej.
              </p>
            )}
            {results.map((entry, index) => (
              <button
                key={`${entry.name}-${entry.lat}-${entry.lon}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`${styles.result} ${index === activeIndex ? styles.resultActive : ''}`}
                onClick={() => choose(entry)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <Icon
                  name={entry.kind === 'observatory' ? 'target' : 'location'}
                  size={15}
                  className={styles.resultIcon}
                />
                <span className={styles.resultMain}>
                  <span className={styles.resultName}>
                    <Highlight text={entry.name} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {[
                      entry.kind === 'observatory' ? 'obserwatorium' : null,
                      entry.region,
                      entry.population > 0 ? `${formatNumber(entry.population)} mieszkańców` : null,
                    ]
                      .filter(Boolean)
                      .join(' , ')}
                  </span>
                </span>
                <BortleMeter value={entry.bortle} />
              </button>
            ))}
          </div>
        )}
      </div>

      {query.length < 2 && (
        <div>
          <p className={styles.sectionLabel}>Propozycje</p>
          <div className={styles.suggestions}>
            {SUGGESTED_LOCATIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                className={styles.suggestion}
                onClick={() =>
                  setLocation({
                    lat: s.lat,
                    lon: s.lon,
                    elevation: s.elevation,
                    label: s.label,
                    source: 'preset',
                    bortle: s.bortle,
                    timezone: 'Europe/Warsaw',
                    region: null,
                  })
                }
              >
                <span
                  className={styles.suggestionDot}
                  style={{ background: bortleColor(s.bortle) }}
                  aria-hidden="true"
                />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className={styles.sectionLabel}>Twoje położenie</p>
        <Button icon="location" onClick={geo.request} loading={geo.status === 'pending'} fullWidth>
          {geo.status === 'pending' ? 'Ustalam położenie' : 'Użyj mojej lokalizacji'}
        </Button>
        {geo.message && (
          <p
            className={`${styles.status} ${geo.status === 'denied' || geo.status === 'error' ? styles.statusError : ''}`}
            style={{ marginTop: 'var(--space-2)' }}
            role={geo.status === 'denied' || geo.status === 'error' ? 'alert' : undefined}
          >
            {geo.message}
          </p>
        )}
      </div>

      <div>
        <p className={styles.sectionLabel}>Współrzędne ręcznie</p>
        <div className={styles.manual}>
          <Field
            label="Szerokość"
            placeholder="52,2298"
            inputMode="decimal"
            value={manual.lat}
            onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
          />
          <Field
            label="Długość"
            placeholder="21,0118"
            inputMode="decimal"
            value={manual.lon}
            onChange={(e) => setManual((m) => ({ ...m, lon: e.target.value }))}
          />
        </div>
        {manualError && (
          <p className={`${styles.status} ${styles.statusError}`} role="alert" style={{ marginTop: 'var(--space-2)' }}>
            {manualError}
          </p>
        )}
        <Button
          variant="secondary"
          onClick={applyManual}
          disabled={!manual.lat || !manual.lon}
          fullWidth
          style={{ marginTop: 'var(--space-3)' }}
        >
          Ustaw współrzędne
        </Button>
      </div>

      {location.source === 'geolocation' && (
        <Chip tone="visible" dot>
          Położenie z przeglądarki
        </Chip>
      )}
    </div>
  );
}
