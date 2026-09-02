import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon, IconButton, Segmented } from '@/components/ui';
import { toObserver } from '@/lib/astro/ephemeris';
import { positionOf } from '@/lib/astro/ephemeris';
import { skyTint } from '@/lib/render/layers/skyBackground';
import { formatDate, formatTime, formatDuration } from '@/lib/format';
import { nightKey, useNightWindow } from '@/state/useNight';
import { onPreciseTime, useSkyStore } from '@/state/useSkyStore';

import styles from './NightTimeline.module.css';

type Mode = 'night' | 'day';

/*
 * Kroki prędkości przewijania czasu, opisane skutkiem, a nie krotnością.
 * Sześćdziesiąt oznacza minutę nieba na sekundę zegara.
 */
const SPEEDS: { value: number; label: string; title: string }[] = [
  { value: 60, label: '1 min/s', title: 'Jedna minuta nieba na sekundę' },
  { value: 600, label: '10 min/s', title: 'Dziesięć minut nieba na sekundę' },
  { value: 3600, label: '1 h/s', title: 'Godzina nieba na sekundę' },
  { value: 86400, label: '1 doba/s', title: 'Doba nieba na sekundę' },
];

const HOUR_MS = 3600000;

/**
 * Oś czasu nocy.
 *
 * Odpowiada na pytanie, jak wygląda niebo z danego miejsca w kolejnych godzinach.
 * Tło paska nie jest ozdobą: kolor w każdym punkcie wynika z rzeczywistej wysokości
 * Słońca policzonej dla tej chwili i tej lokalizacji, więc od razu widać,
 * kiedy zapada prawdziwa ciemność, a kiedy trwa jeszcze zmierzch.
 */
export function NightTimeline() {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const live = useSkyStore((s) => s.live);
  const timeScale = useSkyStore((s) => s.timeScale);
  const setDate = useSkyStore((s) => s.setDate);
  const goToNow = useSkyStore((s) => s.goToNow);
  const setTimeScale = useSkyStore((s) => s.setTimeScale);
  const collapsed = useSkyStore((s) => s.timelineCollapsed);
  const setCollapsed = useSkyStore((s) => s.setTimelineCollapsed);

  const [mode, setMode] = useState<Mode>('night');
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const observer = useMemo(() => toObserver(location), [location]);

  /* Okno nocy dla doby, w której znajduje się wybrana chwila.
   * Zapamiętane po kluczu nocy, więc tyknięcie zegara go nie unieważnia. */
  const night = useNightWindow(location, date);
  const anchorKey = nightKey(date);

  /*
   * Zakres osi. W trybie nocnym pokazujemy odcinek od godziny przed zachodem
   * do godziny po wschodzie Słońca, żeby zmierzch i świt mieściły się w kadrze.
   * W trybie dobowym rozciągamy oś na pełne dwadzieścia cztery godziny wokół
   * lokalnego południa, dzięki czemu noc zawsze leży pośrodku.
   */
  const range = useMemo(() => {
    const anchor = new Date(anchorKey);
    if (mode === 'day') {
      const start = new Date(anchor);
      start.setHours(12, 0, 0, 0);
      return { start, end: new Date(start.getTime() + 24 * HOUR_MS) };
    }
    const sunset = night.sunset ?? new Date(anchor.getTime() + 19 * HOUR_MS);
    const sunrise = night.sunrise ?? new Date(anchor.getTime() + 29 * HOUR_MS);
    let start = new Date(sunset.getTime() - HOUR_MS);
    let end = new Date(sunrise.getTime() + HOUR_MS);
    /* Zabezpieczenie na wypadek nocy polarnej albo dnia polarnego,
     * gdy wschód i zachód nie występują albo wypadają w odwrotnej kolejności. */
    if (end.getTime() - start.getTime() < 2 * HOUR_MS) {
      start = new Date(anchor.getTime() + 18 * HOUR_MS);
      end = new Date(anchor.getTime() + 30 * HOUR_MS);
    }
    return { start, end };
  }, [mode, anchorKey, night]);

  const span = range.end.getTime() - range.start.getTime();

  /*
   * Gradient pasma. Próbkujemy wysokość Słońca w kilkudziesięciu punktach
   * i zamieniamy ją na te same barwy, których używa tło mapy nieba,
   * dzięki czemu pasek i mapa mówią to samo.
   */
  const gradient = useMemo(() => {
    const steps = 40;
    const stops: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = new Date(range.start.getTime() + (span * i) / steps);
      const alt = positionOf('sun', t, observer).altitude;
      const tint = skyTint(alt);
      /* Mieszamy barwę zenitu z barwą horyzontu, żeby pasek miał ten sam
       * ciężar wizualny co obraz nieba, a nie był płaską plamą. */
      const r = Math.round(tint.zenith[0] * 0.55 + tint.horizon[0] * 0.45);
      const g = Math.round(tint.zenith[1] * 0.55 + tint.horizon[1] * 0.45);
      const b = Math.round(tint.zenith[2] * 0.55 + tint.horizon[2] * 0.45);
      stops.push(`rgb(${r} ${g} ${b}) ${((i / steps) * 100).toFixed(1)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [range.start, span, observer]);


  const positionFor = useCallback(
    (t: Date | null) => {
      if (!t) return null;
      const ratio = (t.getTime() - range.start.getTime()) / span;
      return ratio >= -0.02 && ratio <= 1.02 ? Math.min(1, Math.max(0, ratio)) : null;
    },
    [range.start, span],
  );

  const handlePosition = positionFor(date) ?? 0;

  /*
   * Płynny ruch uchwytu.
   *
   * Data w sklepie zmienia się raz na sekundę, więc sam React przesuwałby uchwyt
   * skokami. Dokładna chwila przychodzi kanałem poza stanem i jest zapisywana wprost
   * do stylu elementu, dzięki czemu uchwyt sunie w każdej klatce, a drzewo komponentów
   * nie jest przy tym w ogóle dotykane.
   */
  const handleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return onPreciseTime((milliseconds) => {
      const node = handleRef.current;
      if (!node) return;
      const ratio = (milliseconds - range.start.getTime()) / span;
      /* Poza zakresem osi uchwyt chowamy zamiast przyklejać go do krawędzi,
       * bo krawędź sugerowałaby, że czas stoi akurat tam. */
      const inside = ratio >= -0.02 && ratio <= 1.02;
      node.style.opacity = inside ? '1' : '0';
      node.style.left = `${Math.min(1, Math.max(0, ratio)) * 100}%`;
    });
  }, [range.start, span]);

  /* Godzinowe podziałki. Przy wąskim ekranie pokazujemy co drugą, żeby się nie zlewały. */
  const ticks = useMemo(() => {
    const out: { ratio: number; label: string; major: boolean }[] = [];
    const first = new Date(range.start);
    first.setMinutes(0, 0, 0);
    if (first < range.start) first.setTime(first.getTime() + HOUR_MS);
    for (let t = first.getTime(); t <= range.end.getTime(); t += HOUR_MS) {
      const d = new Date(t);
      const ratio = (t - range.start.getTime()) / span;
      const hours = d.getHours();
      out.push({
        ratio,
        label: `${String(hours).padStart(2, '0')}`,
        major: hours % (span > 20 * HOUR_MS ? 3 : 2) === 0,
      });
    }
    return out;
  }, [range.start, range.end, span]);

  const events = useMemo(
    () =>
      [
        { time: night.sunset, label: 'zachód Słońca' },
        { time: night.astronomicalDusk, label: 'początek nocy astronomicznej' },
        { time: night.astronomicalDawn, label: 'koniec nocy astronomicznej' },
        { time: night.sunrise, label: 'wschód Słońca' },
      ]
        .map((e) => ({ ...e, ratio: positionFor(e.time) }))
        .filter((e): e is { time: Date; label: string; ratio: number } => e.ratio !== null),
    [night, positionFor],
  );

  const setFromRatio = useCallback(
    (ratio: number) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      setDate(new Date(range.start.getTime() + clamped * span));
    },
    [range.start, span, setDate],
  );

  const ratioFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromRatio(ratioFromEvent(event.clientX));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromRatio(ratioFromEvent(event.clientX));
  };

  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 60 : 10;
    if (event.key === 'ArrowLeft') {
      setDate(new Date(date.getTime() - step * 60000));
    } else if (event.key === 'ArrowRight') {
      setDate(new Date(date.getTime() + step * 60000));
    } else if (event.key === 'Home') {
      setDate(range.start);
    } else if (event.key === 'End') {
      setDate(range.end);
    } else {
      return;
    }
    event.preventDefault();
  };

  /*
   * Prędkości przewijania.
   *
   * Mnożniki w rodzaju dwa albo pięć nie mają tu sensu, bo niebo obraca się piętnaście
   * sekund łuku na sekundę: przy pięciokrotnym przyspieszeniu ruch nadal byłby
   * niezauważalny. Skala zaczyna się więc od minuty na sekundę, przy której widać
   * już przesuwanie gwiazd, i sięga doby na sekundę, przy której widać wędrówkę Słońca
   * przez cały rok. Podpisujemy je tym, co robią, a nie samą krotnością, bo "1 h/s"
   * mówi więcej niż "3600 razy".
   */
  /* Przewijanie trwa wtedy, gdy mnożnik jest inny niż jeden. Tryb bieżący wyłącza się
   * sam przy zmianie mnożnika, więc nie trzeba go tu sprawdzać. */
  const playing = timeScale !== 1 && timeScale !== 0;
  /* Zapamiętana prędkość działa też przy zatrzymanym czasie, żeby przycisk odtwarzania
   * ruszał z tą, którą użytkownik ostatnio wybrał. */
  const [chosenSpeed, setChosenSpeed] = useState(0);
  const speedIndex = playing
    ? Math.max(0, SPEEDS.findIndex((s) => s.value === Math.abs(timeScale)))
    : chosenSpeed;
  const speed = SPEEDS[speedIndex] ?? SPEEDS[0];
  const reversed = timeScale < 0;
  const direction = reversed ? -1 : 1;

  const togglePlay = () => setTimeScale(playing ? 1 : direction * speed.value);
  const cycleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setChosenSpeed(nextIndex);
    /* Zmiana prędkości w trakcie przewijania działa od razu. Przy zatrzymanym czasie
     * tylko zapamiętuje wybór, bo kliknięcie prędkości nie jest prośbą o uruchomienie. */
    if (playing) setTimeScale(direction * SPEEDS[nextIndex].value);
  };
  const toggleDirection = () => setTimeScale(-timeScale);

  /* Po dojściu do końca zakresu zatrzymujemy odtwarzanie, zamiast wybiegać w kolejną dobę. */
  useEffect(() => {
    if (playing && date.getTime() >= range.end.getTime()) setTimeScale(1);
  }, [playing, date, range.end, setTimeScale]);

  const jumps = [
    { label: 'Zachód Słońca', time: night.sunset },
    { label: 'Zmierzch astr.', time: night.astronomicalDusk },
    { label: 'Świt astr.', time: night.astronomicalDawn },
    { label: 'Wschód Słońca', time: night.sunrise },
  ];

  /*
   * Widok zwinięty.
   *
   * Oś czasu zajmuje na telefonie sporą część ekranu i przy czytaniu innych sekcji
   * bardziej przeszkadza, niż pomaga. Zwinięta zostawia to, co naprawdę musi być
   * cały czas widoczne: bieżącą godzinę i informację, czy mapa idzie za zegarem.
   */
  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.collapsed}
        onClick={() => setCollapsed(false)}
        title={`Rozwiń oś czasu. Teraz: ${live ? 'na żywo' : playing ? speed.label : 'podgląd'}`}
      >
        <span
          className={`${styles.collapsedDot} ${live ? styles.collapsedDotLive : ''}`}
          aria-hidden="true"
        />
        <span className={styles.collapsedTime}>{formatTime(date)}</span>
        <Icon name="chevronDown" size={14} className={styles.collapsedIcon} />
      </button>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {/*
          * Zwijanie przez kliknięcie zegara, a nie przez osobny przycisk w rzędzie
          * sterowania. Rozwinięta i zwinięta oś czasu mają wtedy ten sam punkt
          * dotknięcia w tym samym miejscu ekranu, więc nie trzeba go szukać za drugim
          * razem. Rząd sterowania jest przy tym i tak ciasny na telefonie.
          */}
        <button
          type="button"
          className={styles.clock}
          onClick={() => setCollapsed(true)}
          title="Zwiń oś czasu"
        >
          <span className={styles.time}>{formatTime(date)}</span>
          <span className={styles.date}>{formatDate(date)}</span>
          <Icon name="chevronDown" size={14} className={styles.clockChevron} />
        </button>

        <div className={styles.spacer} />

        {night.darkMinutes !== null && (
          <p className={styles.summary}>
            Noc astronomiczna trwa {formatDuration(night.darkMinutes)}
          </p>
        )}

        <div className={styles.controls}>
          <Segmented
            label="Zakres osi czasu"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'night', label: 'Noc' },
              { value: 'day', label: 'Doba' },
            ]}
          />
          <IconButton
            icon="rewind"
            label={playing ? 'Odwróć kierunek upływu czasu' : 'Cofnij o godzinę'}
            active={playing && reversed}
            onClick={() =>
              playing ? toggleDirection() : setDate(new Date(date.getTime() - HOUR_MS))
            }
          />
          <IconButton
            icon={playing ? 'pause' : 'play'}
            label={playing ? 'Zatrzymaj upływ czasu' : 'Przewijaj czas'}
            active={playing}
            onClick={togglePlay}
          />
          <IconButton
            icon="forward"
            label={playing ? 'Odwróć kierunek upływu czasu' : 'Przesuń o godzinę'}
            active={playing && !reversed}
            onClick={() =>
              playing ? toggleDirection() : setDate(new Date(date.getTime() + HOUR_MS))
            }
          />
          {/* Prędkość przewijania. Kliknięcie przechodzi do kolejnego kroku. */}
          <button
            type="button"
            className={`${styles.speedButton} ${playing ? styles.speedButtonActive : ''}`}
            onClick={cycleSpeed}
            title={`${speed.title}. Kliknij, żeby zmienić prędkość.`}
          >
            {reversed && playing ? '\u2212' : ''}
            {speed.label}
          </button>
          {/* Podpisany przycisk zamiast samej ikony: powrót do czasu bieżącego jest
            * najczęstszą operacją po zabawie osią czasu i nie może wymagać zgadywania. */}
          <button
            type="button"
            className={`${styles.nowButton} ${live ? styles.nowButtonActive : ''}`}
            onClick={goToNow}
            title="Ustaw aktualną godzinę i wróć do podglądu na żywo"
          >
            <Icon name="clock" size={14} />
            <span>{live ? 'Na żywo' : 'Teraz'}</span>
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label="Godzina obserwacji"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(handlePosition * 100)}
        aria-valuetext={`${formatTime(date)}, ${formatDate(date)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className={styles.band} style={{ background: gradient }} />
        <div className={styles.ticks}>
          {ticks.map((tick, i) => (
            <span key={i}>
              <span className={styles.tick} style={{ left: `${tick.ratio * 100}%` }} />
              {tick.major && (
                <span className={styles.tickLabel} style={{ left: `${tick.ratio * 100}%` }}>
                  {tick.label}
                </span>
              )}
            </span>
          ))}
          {events.map((event) => (
            <span
              key={event.label}
              className={styles.event}
              style={{ left: `${event.ratio * 100}%` }}
              title={`${event.label}: ${formatTime(event.time)}`}
            >
              <span className={styles.eventDot} />
            </span>
          ))}
        </div>
        <div ref={handleRef} className={styles.handle} style={{ left: `${handlePosition * 100}%` }}>
          <span className={styles.handleGrip} />
        </div>
      </div>

      <div className={styles.jumps}>
        {jumps.map((jump) => (
          <button
            key={jump.label}
            type="button"
            className={styles.jump}
            disabled={!jump.time}
            onClick={() => jump.time && setDate(jump.time)}
          >
            {jump.label}
            <span className={styles.jumpTime}>{jump.time ? formatTime(jump.time) : 'brak'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
