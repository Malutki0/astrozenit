import { useEffect, useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Chip, IconButton, Segmented, Skeleton } from '@/components/ui';
import { toObserver } from '@/lib/astro/ephemeris';
import { generateEvents } from '@/lib/astro/events';
import { monthIllumination } from '@/lib/astro/moon';
import type { AstroEvent } from '@/lib/astro/types';
import { formatDate, formatMonthYear, formatTime, formatWeekday } from '@/lib/format';
import { useSkyStore } from '@/state/useSkyStore';

import { EventCard } from './EventCard';
import type { SectionProps } from './shared';
import styles from './sections.module.css';

type View = 'list' | 'grid';

/*
 * Filtr rodzaju wydarzenia.
 *
 * Wcześniej odsiew był zaszyty w kodzie: spis wieloletni pokazywał tylko wydarzenia
 * rangi 1 i 2 oraz pełnie i nowie, przez co ze stu dwudziestu policzonych zostawało
 * sześćdziesiąt sześć i kalendarz wyglądał na uboższy od sekcji Zjawisk. Decyzja,
 * co jest warte pokazania, należy do obserwatora, nie do kodu, więc zamiast ukrytego
 * odsiewu jest jawny filtr z licznikami.
 */
type Filter = 'wszystko' | 'wazne' | AstroEvent['kind'];

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'wszystko', label: 'Wszystko' },
  { id: 'wazne', label: 'Warte uwagi' },
  { id: 'moon-phase', label: 'Fazy Księżyca' },
  { id: 'lunar-eclipse', label: 'Zaćmienia Księżyca' },
  { id: 'solar-eclipse', label: 'Zaćmienia Słońca' },
  { id: 'meteor-shower', label: 'Roje meteorów' },
  { id: 'opposition', label: 'Opozycje' },
  { id: 'elongation', label: 'Elongacje' },
  { id: 'conjunction', label: 'Zbliżenia' },
  { id: 'season', label: 'Pory roku' },
];

/** Czy wydarzenie przechodzi przez wybrany filtr. */
function passes(event: AstroEvent, filter: Filter): boolean {
  if (filter === 'wszystko') return true;
  /* "Warte uwagi" to wydarzenia rangi 1 i 2 oraz pełnia i nów, bo tylko te dwie fazy
   * realnie zmieniają warunki obserwacji. Kwadry są w widoku pełnym. */
  if (filter === 'wazne') {
    if (event.kind === 'moon-phase') return /pełnia|nów/i.test(event.title);
    return event.rank <= 2;
  }
  return event.kind === filter;
}

/*
 * Lista sięga do końca przyszłego roku kalendarzowego, licząc od dnia otwarcia aplikacji.
 * Zakres przesuwa się więc sam i nie wymaga corocznej poprawki w kodzie.
 *
 * Wcześniej był tu przełącznik między miesiącem a zakresem wieloletnim. Okazał się zbędny:
 * lista i tak jest pogrupowana miesiącami, więc jeden ciągły spis przewijany w dół daje
 * dokładnie to samo, tylko bez zmuszania do wyboru zakresu przed zobaczeniem czegokolwiek.
 */
function horizonRange(now: Date): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  /*
   * Spis sięga do końca trzeciego roku licząc od bieżącego, czyli obejmuje od trzech
   * do czterech lat zależnie od miesiąca otwarcia. Tyle wystarcza, żeby zaplanować
   * wyjazd pod zaćmienie albo pod dobrze ustawiony rój, a jednocześnie na tyle mało,
   * żeby dało się to policzyć w ćwierć sekundy i przewinąć bez zmęczenia.
   *
   * Zakres przesuwa się sam wraz z upływem czasu i nie wymaga corocznej poprawki.
   */
  return { from, to: new Date(now.getFullYear() + 3, 11, 31, 23, 59, 59) };
}

const WEEKDAYS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'ndz'];

/* Kolor znacznika w siatce miesiąca. Rodzaj zjawiska jest zawsze podany także słowem
 * w szczegółach dnia, więc kolor nie jest jedynym nośnikiem informacji. */
const KIND_COLOR: Record<AstroEvent['kind'], string> = {
  'moon-phase': 'var(--text-tertiary)',
  'lunar-eclipse': 'var(--signal-warn)',
  'solar-eclipse': 'var(--signal-warn)',
  'meteor-shower': 'var(--accent)',
  opposition: 'var(--signal-visible)',
  conjunction: 'var(--signal-visible)',
  elongation: 'var(--signal-visible)',
  season: 'var(--text-tertiary)',
  apsis: 'var(--text-tertiary)',
  'peak-magnitude': 'var(--accent)',
};

export function CalendarSection({ onClose }: SectionProps) {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const setDate = useSkyStore((s) => s.setDate);

  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('wazne');
  const [cursor, setCursor] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(date.getDate());

  /* Siatka miesiąca ma własny, krótki zakres i liczy się od razu, bo jeden miesiąc
   * to kilkadziesiąt milisekund. */
  const month = useMemo(() => {
    const observer = toObserver(location);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const events = generateEvents(first, last, observer);

    const byDay = new Map<number, AstroEvent[]>();
    for (const event of events) {
      const day = event.date.getDate();
      const list = byDay.get(day) ?? [];
      list.push(event);
      byDay.set(day, list);
    }

    /* Poniedziałek jako pierwszy dzień tygodnia, zgodnie z polskim zwyczajem. */
    const offset = (first.getDay() + 6) % 7;

    return {
      first,
      days: last.getDate(),
      offset,
      byDay,
      events,
      illumination: monthIllumination(cursor.getFullYear(), cursor.getMonth()),
    };
  }, [cursor, location]);

  /*
   * Zakres wieloletni liczy się około stu pięćdziesięciu milisekund, więc odkładamy go
   * o jedną klatkę. Przełącznik zdąży się przerysować, zanim zacznie się liczenie,
   * a użytkownik widzi szkielet listy zamiast zamrożonego interfejsu.
   */
  const [horizon, setHorizon] = useState<AstroEvent[] | null>(null);
  useEffect(() => {
    if (view !== 'list') return;
    let cancelled = false;
    setHorizon(null);
    /* Odroczenie przez licznik czasu, a nie przez klatkę animacji: pętla klatek stoi,
     * gdy karta przeglądarki jest w tle, i spis nigdy by się nie policzył. */
    const id = window.setTimeout(() => {
      const { from, to } = horizonRange(new Date());
      const events = generateEvents(from, to, toObserver(location), {
        /* Pary planet zmieniają się przez wiele dni, więc krok dobowy niczego nie gubi.
         * Zbliżenia Księżyca wypadają co miesiąc i w tak długim spisie tylko by go zaśmieciły. */
        conjunctionStepHours: 24,
        includeMoonConjunctions: false,
      });
      if (!cancelled) setHorizon(events);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [view, location]);

  /* Grupowanie miesiącami. Odsiew robi wyłącznie filtr wybrany przez użytkownika. */
  const horizonGroups = useMemo(() => {
    if (!horizon) return null;
    const groups = new Map<string, { label: string; events: AstroEvent[] }>();
    for (const event of horizon) {
      if (!passes(event, filter)) continue;
      const key = `${event.date.getFullYear()}-${event.date.getMonth()}`;
      const group = groups.get(key) ?? { label: formatMonthYear(event.date), events: [] };
      group.events.push(event);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [horizon, filter]);

  const shift = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    setSelectedDay(null);
  };

  const jumpTo = (event: AstroEvent) => {
    setDate(event.date);
    setSelectedDay(event.date.getDate());
  };

  const selectedEvents = selectedDay ? (month.byDay.get(selectedDay) ?? []) : [];
  const selectedDate = selectedDay
    ? new Date(cursor.getFullYear(), cursor.getMonth(), selectedDay, 21, 0, 0)
    : null;

  /* Liczniki przy filtrach pokazują, ile wydarzeń kryje się pod każdym z nich
   * w aktualnie wybranym zakresie. Bez nich filtr byłby strzałem w ciemno. */
  const counts = useMemo(() => {
    const pool = horizon ?? [];
    const out = new Map<Filter, number>();
    for (const f of FILTERS) out.set(f.id, pool.filter((e) => passes(e, f.id)).length);
    return out;
  }, [horizon]);

  const endYear = horizonRange(new Date()).to.getFullYear();

  return (
    <Panel
      eyebrow={
        view === 'list'
          ? `Kiedy co wypada, do końca ${endYear} roku`
          : `${month.events.length} wydarzeń w tym miesiącu`
      }
      title="Kalendarz wydarzeń"
      onClose={onClose}
      wide
      actions={
        /* Strzałki przewijają miesiące, więc mają sens tylko w siatce.
         * Lista jest ciągła i przewija się zwyczajnie w dół. */
        view === 'grid' ? (
          <>
            <IconButton icon="chevronLeft" label="Poprzedni miesiąc" onClick={() => shift(-1)} />
            <IconButton icon="chevronRight" label="Następny miesiąc" onClick={() => shift(1)} />
          </>
        ) : null
      }
      photoKey="scene:calendar"
    >
      <div className={styles.stack}>
        <p className={styles.lead}>
          Chronologiczny spis tego, co i kiedy wypada na niebie, od dziś do końca{' '}
          {endYear} roku. Siatka miesiąca pokazuje to samo dzień po dniu, razem z fazą Księżyca.
          Wyjaśnienia, czym te zjawiska są i na co przy nich patrzeć, znajdziesz w sekcji
          Zjawiska astronomiczne.
        </p>

        <div className={styles.filters} style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
          <Segmented
            label="Widok kalendarza"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'Lista' },
              { value: 'grid', label: 'Siatka miesiąca' },
            ]}
          />
        </div>

        {view === 'grid' && <p className={styles.monthLabel}>{formatMonthYear(cursor)}</p>}

        {/* Filtr rodzaju. W siatce nie ma sensu, bo tam liczy się dzień, a nie rodzaj
          * wydarzenia, i wszystkie znaczniki dnia i tak są widoczne. */}
        {view === 'list' && (
          <div className={styles.chips}>
            {FILTERS.map((f) => {
              const count = counts.get(f.id) ?? 0;
              /* Rodzaj, którego w tym zakresie nie ma, tylko zaśmiecałby pasek. */
              if (count === 0 && f.id !== 'wszystko' && f.id !== 'wazne') return null;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`${styles.chipButton} ${filter === f.id ? styles.chipButtonActive : ''}`}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                >
                  {f.label}
                  <span className={styles.chipButtonCount}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {view === 'list' ? (
          !horizonGroups ? (
            <div className={styles.cardStack}>
              <Skeleton height={132} />
              <Skeleton height={132} />
              <Skeleton height={132} />
            </div>
          ) : horizonGroups.length === 0 ? (
            <p className={styles.hint} style={{ marginTop: 0 }}>
              Żadne wydarzenie w tym zakresie nie pasuje do wybranego filtra.
            </p>
          ) : (
            <div className={styles.stack}>
              <p className={styles.hint} style={{ marginTop: 0 }}>
                Jedyne, czego na tej liście nie ma, to zbliżenia Księżyca z planetami:
                wypadają co miesiąc i przez szesnaście miesięcy dałyby około dwustu wierszy,
                pod którymi zginęłoby wszystko inne. Widać je w siatce miesiąca,
                po kliknięciu dnia.
              </p>
              {horizonGroups.map((group) => (
                <div key={group.label}>
                  <div className={styles.groupHead}>
                    <p className={styles.sectionTitle} style={{ margin: 0 }}>
                      {group.label}
                    </p>
                    <Chip>{group.events.length}</Chip>
                  </div>
                  <div className={styles.cardStack}>
                    {group.events.map((event) => (
                      <EventCard key={event.id} event={event} now={date} onSelect={jumpTo} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className={styles.calendar} role="grid" aria-label={`Kalendarz, ${formatMonthYear(cursor)}`}>
              {WEEKDAYS.map((d) => (
                <span key={d} className={styles.calendarHead} role="columnheader">
                  {d}
                </span>
              ))}
              {Array.from({ length: month.offset }, (_, i) => (
                <span key={`pusty-${i}`} className={styles.calendarEmpty} />
              ))}
              {Array.from({ length: month.days }, (_, i) => {
                const day = i + 1;
                const events = month.byDay.get(day) ?? [];
                const illum = month.illumination[i];
                const isToday =
                  day === date.getDate() &&
                  cursor.getMonth() === date.getMonth() &&
                  cursor.getFullYear() === date.getFullYear();
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    aria-selected={day === selectedDay}
                    className={`${styles.calendarDay} ${day === selectedDay ? styles.calendarDaySelected : ''} ${isToday ? styles.calendarDayToday : ''}`}
                    onClick={() => {
                      setSelectedDay(day);
                      setDate(new Date(cursor.getFullYear(), cursor.getMonth(), day, 22, 0, 0));
                    }}
                  >
                    <span className={styles.calendarNum}>{day}</span>
                    <span
                      className={styles.calendarMoon}
                      style={{
                        background: `linear-gradient(90deg, var(--surface-overlay) ${(1 - illum.fraction) * 100}%, oklch(0.86 0.02 85) ${(1 - illum.fraction) * 100}%)`,
                      }}
                      title={`Oświetlenie tarczy Księżyca: ${Math.round(illum.fraction * 100)} procent`}
                    />
                    <span className={styles.calendarDots}>
                      {events.slice(0, 4).map((event) => (
                        <span
                          key={event.id}
                          className={styles.calendarDot}
                          style={{ background: KIND_COLOR[event.kind] }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.divider} />

            {selectedDate ? (
              <div>
                <p className={styles.sectionTitle}>
                  {formatWeekday(selectedDate)} , {formatDate(selectedDate)}
                </p>
                {selectedEvents.length === 0 ? (
                  <p className={styles.hint} style={{ marginTop: 0 }}>
                    Tego dnia nie wypada żadne szczególne zjawisko. To dobra noc na spokojne
                    przeglądanie nieba bez pośpiechu.
                  </p>
                ) : (
                  <div className={styles.list}>
                    {selectedEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={styles.row}
                        onClick={() => setDate(event.date)}
                      >
                        <span
                          className={styles.eventMarker}
                          style={{ background: KIND_COLOR[event.kind] }}
                          aria-hidden="true"
                        />
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{event.title}</span>
                          <span className={styles.rowSub}>{event.detail}</span>
                        </span>
                        <span className={styles.rowValue}>{formatTime(event.date)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.hint} style={{ marginTop: 0 }}>
                Wybierz dzień, żeby zobaczyć jego szczegóły i ustawić mapę nieba na tę datę.
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
