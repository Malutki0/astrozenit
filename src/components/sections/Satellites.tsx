import { useEffect, useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Button, Chip, Icon, Segmented, Skeleton, Stat, Toggle } from '@/components/ui';
import { toObserver } from '@/lib/astro/ephemeris';
import { compassPoint, formatDate, formatTime } from '@/lib/format';
import { findPasses, mergePasses } from '@/lib/satellites/passes';
import type { SatellitePass } from '@/lib/satellites/types';
import { fixesAbove } from '@/lib/satellites/propagate';
import type { SatelliteRecord } from '@/lib/satellites/types';
import { setAgeHours, useSatelliteStore } from '@/state/useSatellites';
import { useSkyStore } from '@/state/useSkyStore';

import type { SectionProps } from './shared';
import styles from './sections.module.css';

/*
 * Sekcja "Satelity".
 *
 * Sztuczne satelity są jedynym rodzajem obiektu w tej aplikacji, którego położenia
 * nie da się policzyć z samych praw ruchu. Niska orbita jest ciągle zaburzana przez
 * opór resztek atmosfery i przez manewry korekcyjne, więc trzeba pobrać świeże elementy
 * orbitalne. Dlatego ta sekcja, jako jedyna obok Chmur, wymaga sieci i mówi o tym wprost.
 *
 * Dwa widoki odpowiadają na dwa różne pytania. "Teraz" mówi, co w tej chwili jest
 * nad głową. "Przeloty" odpowiada na pytanie praktyczne: o której wyjść na dwór.
 */

type View = 'teraz' | 'przeloty';

/* Satelity, dla których liczymy przeloty. Pełny katalog wymagałby minut liczenia,
 * a i tak większość obiektów jest zbyt słaba, żeby je dostrzec gołym okiem. */
const PASS_TARGETS = ['ISS', 'CSS', 'TIANHE', 'HST', 'HUBBLE'];

/*
 * Dobór obiektów, dla których liczymy przeloty.
 *
 * Pierwsza wersja brała wszystko jaśniejsze od 2,6 wielkości gwiazdowej i miała
 * przez to dwie wady naraz. Po pierwsze, w zestawie okazało się dwadzieścia
 * identycznych wpisów "SL-16 R/B", czyli zużytych członów rakiet Zenit, z tą samą
 * nazwą i tą samą jasnością. Lista przelotów wyglądała jak dwadzieścia razy ten sam
 * wiersz i nie dało się z niej niczego odczytać. Po drugie, te dwadzieścia obiektów
 * pochłaniało trzy czwarte pracy: liczenie zajmowało na telefonie ponad sekundę,
 * przez którą strona nie odpowiadała na dotyk.
 *
 * Teraz bierzemy wszystkie stacje i teleskopy, które da się nazwać, a spośród reszty
 * najjaśniejsze, ale nie więcej niż dwa obiekty o tej samej nazwie i nie więcej niż
 * osiem łącznie. Zestaw schodzi z dwudziestu siedmiu pozycji do dziewięciu, praca
 * z trzystu do stu milisekund, a lista przestaje się powtarzać.
 */
const MAX_BEZ_NAZWY = 8;
const MAX_TEJ_SAMEJ_NAZWY = 2;

function passTargets(all: SatelliteRecord[]): SatelliteRecord[] {
  const nazwane = all.filter((r) => PASS_TARGETS.some((t) => r.name.toUpperCase().startsWith(t)));
  const znane = new Set(nazwane);

  const kandydaci = all
    .filter((r) => !znane.has(r) && (r.standardMagnitude ?? 9) <= 2.6)
    .sort((a, b) => (a.standardMagnitude ?? 9) - (b.standardMagnitude ?? 9));

  const licznik = new Map<string, number>();
  const wybrane: SatelliteRecord[] = [];
  for (const r of kandydaci) {
    if (wybrane.length >= MAX_BEZ_NAZWY) break;
    const ile = (licznik.get(r.name) ?? 0) + 1;
    if (ile > MAX_TEJ_SAMEJ_NAZWY) continue;
    licznik.set(r.name, ile);
    wybrane.push(r);
  }

  return [...nazwane, ...wybrane];
}

function magnitudeLabel(mag: number | null): string {
  if (mag === null) return 'jasność nieznana';
  return `${mag.toFixed(1)} mag`;
}

export function SatellitesSection({ onClose }: SectionProps) {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const layers = useSkyStore((s) => s.layers);
  const setLayer = useSkyStore((s) => s.setLayer);
  const { set, status, error, load } = useSatelliteStore();
  const [view, setView] = useState<View>('przeloty');

  useEffect(() => {
    void load();
  }, [load]);

  const observer = useMemo(
    () => ({ lat: location.lat, lon: location.lon, elevation: location.elevation }),
    [location],
  );

  /* Zaokrąglenie do dziesięciu sekund, żeby tykanie zegara nie przeliczało listy bez przerwy. */
  const tick = Math.floor(date.getTime() / 10_000);

  const above = useMemo(() => {
    if (!set) return [];
    return fixesAbove(set.satellites, new Date(tick * 10_000), observer, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, observer, tick]);

  /*
   * PRZELOTY LICZONE PORCJAMI, POZA PRZELICZANIEM WIDOKU
   *
   * Wyznaczenie przelotów na dwie doby wymaga przepuszczenia dwudziestu siedmiu
   * obiektów przez model SGP4 co minutę symulowanego czasu. To ponad siedemdziesiąt
   * tysięcy wywołań, w przeglądarce na telefonie ponad sekunda pracy. Wcześniej
   * działo się to w useMemo, czyli w trakcie renderowania, i to przy każdej zmianie
   * dziesięciominutowego przedziału czasu. Skutek: przewijanie osi czasu zawieszało
   * całą stronę, bo wątek główny był zajęty liczeniem orbit.
   *
   * Teraz są dwie zmiany naraz.
   *
   * Po pierwsze, lista przelicza się rzadko. Przeloty na dwie doby naprzód nie
   * zmieniają się przez to, że zegar posunął się o kilka minut, więc kluczem jest
   * dwugodzinny przedział, a nie dziesięciominutowy.
   *
   * Po drugie, liczymy porcjami po dwa obiekty, oddając wątek między porcjami.
   * Jedna porcja to około pięćdziesięciu milisekund, czyli najwyżej kilka zgubionych
   * klatek zamiast sekundy bezruchu. W tym czasie sekcja pokazuje, że pracuje,
   * zamiast udawać, że nic się nie dzieje.
   */
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [computingPasses, setComputingPasses] = useState(false);
  const passKey = `${set?.fetchedAt ?? ''}|${location.lat}|${location.lon}|${Math.floor(
    date.getTime() / 7_200_000,
  )}`;

  useEffect(() => {
    if (!set || view !== 'przeloty') return;
    const targets = passTargets(set.satellites);
    const astro = toObserver(location);
    const zebrane: SatellitePass[] = [];
    let index = 0;
    let timer = 0;
    let anulowane = false;

    setComputingPasses(true);

    const porcja = () => {
      if (anulowane) return;
      const koniec = Math.min(index + 2, targets.length);
      for (; index < koniec; index++) {
        zebrane.push(
          ...findPasses(targets[index], date, observer, astro, {
            hours: 48,
            minPeakAltitude: 15,
            onlyVisible: true,
          }),
        );
      }
      if (index < targets.length) {
        timer = window.setTimeout(porcja, 0);
      } else {
        setPasses(mergePasses(zebrane).slice(0, 24));
        setComputingPasses(false);
      }
    };

    timer = window.setTimeout(porcja, 0);
    return () => {
      anulowane = true;
      window.clearTimeout(timer);
    };
    /* Data celowo poza zależnościami: wchodzi do klucza w postaci zgrubnej,
     * a pełna zmieniałaby się co sekundę i unieważniała każdą rozpoczętą porcję. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passKey, view, set, observer]);

  const ageHours = setAgeHours(set);
  const stale = ageHours !== null && ageHours > 72;

  return (
    <Panel
      eyebrow={location.label}
      title="Satelity"
      onClose={onClose}
      wide
      actions={
        <Segmented
          label="Widok satelitów"
          value={view}
          onChange={setView}
          options={[
            { value: 'przeloty', label: 'Przeloty' },
            { value: 'teraz', label: 'Teraz nad głową' },
          ]}
        />
      }
      photoKey="scene:satellites"
    >
      <div className={styles.stack}>
        <div className={styles.toggles}>
          <Toggle
            label="Pokazuj satelity na mapie nieba"
            checked={layers.satellites}
            onChange={(v) => setLayer('satellites', v)}
          />
          <p className={styles.toggleHint}>
            Punkty z obwódką to obiekty oświetlone przez Słońce, czyli możliwe do zobaczenia.
            Same obwódki oznaczają satelitę w cieniu Ziemi: jest nad horyzontem, ale nie świeci.
          </p>
        </div>

        {status === 'loading' && !set && (
          <>
            <Skeleton height={62} />
            <Skeleton height={62} />
            <Skeleton height={62} />
          </>
        )}

        {status === 'error' && (
          <div className={styles.warnBox}>
            <p style={{ margin: 0 }}>{error}</p>
            <Button onClick={() => void load(true)}>Spróbuj ponownie</Button>
          </div>
        )}

        {set && (
          <>
            {stale && (
              <div className={styles.warnBox}>
                <p style={{ margin: 0 }}>
                  Elementy orbitalne mają {Math.round(ageHours! / 24)} dni. Po takim czasie
                  przewidziany moment przelotu może się mylić o kilka minut, a tor o kilka stopni.
                </p>
                <Button onClick={() => void load(true)}>Pobierz świeże dane</Button>
              </div>
            )}

            {view === 'przeloty' ? (
              <div>
                <p className={styles.sectionTitle}>Widoczne przeloty przez najbliższe dwie doby</p>
                {computingPasses && passes.length === 0 ? (
                  /*
                   * Liczenie trwa około sekundy, rozłożonej na porcje. Przez ten czas
                   * pokazujemy zarys listy zamiast pustki albo komunikatu o braku
                   * przelotów, bo jedno i drugie byłoby nieprawdą.
                   */
                  <div className={styles.list} aria-busy="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className={styles.row}>
                        <span className={styles.rowMain}>
                          <Skeleton width="52%" height={15} />
                          <span style={{ display: 'block', marginTop: 6 }}>
                            <Skeleton width="72%" height={12} />
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : passes.length === 0 ? (
                  <p className={styles.hint} style={{ marginTop: 0 }}>
                    W najbliższych dwóch dobach żaden z jasnych satelitów nie przelatuje
                    w warunkach pozwalających go zobaczyć. Przelot musi wypaść w oknie,
                    w którym u nas jest już ciemno, a na wysokości orbity wciąż świeci Słońce.
                  </p>
                ) : (
                  <div className={styles.list}>
                    {passes.map((pass) => (
                      <div key={`${pass.id}-${pass.start.getTime()}`} className={styles.row}>
                        <span className={styles.rowIcon}>
                          <Icon name="satellite" size={16} />
                        </span>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>
                            {pass.label ?? pass.name}
                            {/* Numer katalogowy przy nazwach, które się powtarzają:
                              * na orbicie krąży kilkanaście członów rakiet tego samego typu. */}
                            {!pass.label && <span className={styles.rowNote}> NORAD {pass.id}</span>}
                          </span>
                          <span className={styles.rowSub}>
                            {formatDate(pass.start)}, od {formatTime(pass.start)} do{' '}
                            {formatTime(pass.end)}. Wschodzi na {compassPoint(pass.startAzimuth)},
                            góruje {Math.round(pass.maxAltitude)} stopni nad horyzontem na{' '}
                            {compassPoint(pass.peakAzimuth)}, znika na {compassPoint(pass.endAzimuth)}.
                          </span>
                        </span>
                        <span className={styles.rowNumbers}>
                          <span className={`${styles.rowValue} num`}>{magnitudeLabel(pass.magnitude)}</span>
                          <span className={`${styles.rowValueMuted} num`}>
                            {Math.round((pass.end.getTime() - pass.start.getTime()) / 60000)} min
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className={styles.hint}>
                  Satelita wygląda jak gwiazda, która równo sunie przez niebo i nie miga.
                  Migające światła należą do samolotów. Przelot kończy się często nagłym
                  zgaśnięciem: to moment wejścia w cień Ziemi.
                </p>
              </div>
            ) : (
              <div>
                <p className={styles.sectionTitle}>
                  Nad horyzontem o {formatTime(date)}
                </p>
                <div className={styles.grid}>
                  <Stat label="Obiektów powyżej 10 stopni" value={String(above.length)} />
                  <Stat
                    label="W świetle Słońca"
                    value={String(above.filter((s) => s.sunlit).length)}
                  />
                  <Stat label="W zestawie" value={String(set.satellites.length)} />
                  <Stat
                    label="Wiek danych"
                    value={ageHours !== null ? `${Math.round(ageHours)} h` : 'nieznany'}
                  />
                </div>
                {above.length === 0 ? (
                  <p className={styles.hint}>
                    W tej chwili żaden satelita z zestawu nie jest wyżej niż dziesięć stopni
                    nad horyzontem. Za kilka minut będzie inaczej: obieg niskiej orbity
                    trwa około półtorej godziny.
                  </p>
                ) : (
                  <div className={styles.list}>
                    {above.slice(0, 20).map((fix) => (
                      <div key={fix.id} className={styles.row}>
                        <span className={styles.rowIcon}>
                          <Icon name="satellite" size={16} />
                        </span>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{fix.label ?? fix.name}</span>
                          <span className={styles.rowSub}>
                            {Math.round(fix.height)} km nad Ziemią, w odległości{' '}
                            {Math.round(fix.range).toLocaleString('pl-PL')} km.{' '}
                            {fix.sunlit ? 'W świetle Słońca.' : 'W cieniu Ziemi, więc niewidoczny.'}
                          </span>
                        </span>
                        <span className={styles.rowNumbers}>
                          <span className={`${styles.rowValue} num`}>
                            {Math.round(fix.altitude)} st
                          </span>
                          <span className={`${styles.rowValueMuted} num`}>
                            {compassPoint(fix.azimuth)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.divider} />
            <div className={styles.chipRow}>
              <Chip>{set.builtin ? 'kopia wbudowana w aplikację' : set.source}</Chip>
              <Chip>
                elementy z {formatDate(new Date(set.fetchedAt))}, {formatTime(new Date(set.fetchedAt))}
              </Chip>
            </div>
            <p className={styles.hint} style={{ marginTop: 'var(--space-2)' }}>
              Położenia liczy model SGP4 na elementach orbitalnych z Celestraku, które są
              w domenie publicznej. Elementy starzeją się: po tygodniu błąd momentu przelotu
              sięga kilku minut, dlatego przy każdym wejściu sprawdzamy, czy nie ma świeższych.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
