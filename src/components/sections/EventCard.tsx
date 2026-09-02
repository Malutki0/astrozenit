import { useMemo } from 'react';

import { BODY_PROFILES } from '@/lib/astro/constants';
import { MoonPhase } from 'astronomy-engine';
import type { AstroEvent } from '@/lib/astro/types';
import { formatDate, formatTime, formatWeekday, relativeDays } from '@/lib/format';

import { PhotoThumb } from '@/components/ui';
import { usePhotos } from '@/state/usePhotos';
import { PlanetGlobe } from '@/components/panels/PlanetGlobe';
import type { BodyKey } from '@/lib/astro/types';
import styles from './EventCard.module.css';

/*
 * Karta wydarzenia.
 *
 * Każdy rodzaj zjawiska ma własne tło i własną ilustrację, rysowaną wektorowo
 * na podstawie rzeczywistych danych: faza Księżyca odpowiada tej z danego dnia,
 * a przy zbliżeniach widać, które dwa ciała się spotykają. Ilustracje nie są
 * obrazkami z zewnątrz, tylko wynikiem tych samych obliczeń, które napędzają mapę.
 */

type Palette = { from: string; to: string; ink: string };

const PALETTES: Record<AstroEvent['kind'], Palette> = {
  'moon-phase': { from: 'oklch(0.30 0.055 250)', to: 'oklch(0.17 0.04 262)', ink: 'oklch(0.93 0.02 250)' },
  conjunction: { from: 'oklch(0.34 0.06 258)', to: 'oklch(0.42 0.075 45)', ink: 'oklch(0.96 0.02 60)' },
  'lunar-eclipse': { from: 'oklch(0.32 0.09 30)', to: 'oklch(0.18 0.05 20)', ink: 'oklch(0.95 0.03 40)' },
  'solar-eclipse': { from: 'oklch(0.38 0.08 70)', to: 'oklch(0.20 0.05 40)', ink: 'oklch(0.96 0.03 70)' },
  'meteor-shower': { from: 'oklch(0.26 0.05 265)', to: 'oklch(0.34 0.09 300)', ink: 'oklch(0.94 0.03 300)' },
  opposition: { from: 'oklch(0.28 0.07 275)', to: 'oklch(0.20 0.05 250)', ink: 'oklch(0.94 0.02 270)' },
  elongation: { from: 'oklch(0.33 0.06 230)', to: 'oklch(0.22 0.05 250)', ink: 'oklch(0.94 0.02 230)' },
  season: { from: 'oklch(0.28 0.09 310)', to: 'oklch(0.20 0.07 290)', ink: 'oklch(0.94 0.03 310)' },
  apsis: { from: 'oklch(0.26 0.04 265)', to: 'oklch(0.18 0.03 265)', ink: 'oklch(0.92 0.02 265)' },
  /* Największa jasność planety wewnętrznej: barwa Wenus tuż po zachodzie Słońca. */
  'peak-magnitude': { from: '#2b2540', to: '#4a3a52', ink: 'oklch(0.96 0.02 80)' },
};

/** Tarcza Księżyca z terminatorem odpowiadającym rzeczywistej fazie danego dnia. */
/*
 * Księżyc w karcie wydarzenia.
 *
 * Prawdziwa mapa powierzchni ze zdjęć sond, oświetlona dokładnie tak, jak wypada
 * w dniu tego wydarzenia. Wcześniej był tu rysunek: koło z łukiem terminatora,
 * poprawny co do kształtu, ale bez mórz i kraterów, więc pełnia i nów wyglądały
 * jak dwa jednolite krążki, jasny i ciemny.
 *
 * Teraz w pełni widać rzeczywistą tarczę, a w nowiu ciemną kulę z ledwie widocznym
 * konturem, bo tak właśnie Księżyc wtedy wygląda: jest na niebie, tylko zwrócony
 * do nas stroną nieoświetloną. Ułamek oświetlenia liczymy z kąta fazowego na tę
 * konkretną datę, więc karta pierwszej kwadry pokazuje połowę tarczy, a nie symbol
 * pierwszej kwadry.
 */
function MoonArt({ date, size = 74 }: { date: Date; size?: number }) {
  const { fraction, waxing } = useMemo(() => {
    const phase = MoonPhase(date);
    return { fraction: (1 - Math.cos((phase * Math.PI) / 180)) / 2, waxing: phase < 180 };
  }, [date]);

  return (
    <PlanetGlobe body="moon" size={size} illumination={fraction} waxing={waxing} locked still />
  );
}

/** Dwa ciała obok siebie, jak przy zbliżeniu na niebie. */
/*
 * Zbliżenie dwóch ciał.
 *
 * Oba narysowane z map powierzchni, w ustawieniu takim, jak na niebie: jedno wyżej
 * i z prawej, drugie niżej i z lewej. Wcześniej były to dwa kolorowe krążki i karta
 * "Zbliżenie: Mars i Jowisz" wyglądała identycznie jak "Zbliżenie: Wenus i Saturn".
 * Teraz od razu widać, które to planety, bo Jowisz ma pasy, a Saturn pierścienie.
 *
 * Ciała są mniejsze niż w kartach z jednym obiektem, bo muszą się zmieścić dwa,
 * ale to akurat oddaje sens zjawiska: zbliżenie to dwa obiekty obok siebie.
 */
function PairArt({ event, size = 74 }: { event: AstroEvent; size?: number }) {
  const a = event.body;
  const b = event.bodyB;
  if (!a || !b) return null;
  const mniejsze = Math.round(size * 0.52);

  return (
    <span className={styles.pair} style={{ width: size, height: size }} aria-hidden="true">
      <span className={styles.pairFirst}>
        <PlanetGlobe body={a} size={mniejsze} still locked />
      </span>
      <span className={styles.pairSecond}>
        <PlanetGlobe body={b} size={mniejsze} still locked />
      </span>
    </span>
  );
}

/*
 * Ziemia, dla równonocy i przesileń.
 *
 * Prawdziwa mapa powierzchni, bo pory roku są zjawiskiem ziemskim: bierze się
 * z nachylenia osi obrotu do płaszczyzny orbity, przez które przez pół roku
 * ku Słońcu zwrócona jest jedna półkula, a przez drugie pół druga. Globus jest
 * przechylony dokładnie o te dwadzieścia trzy i pół stopnia, o które chodzi.
 */
function SeasonArt({ size = 74 }: { size?: number }) {
  return <PlanetGlobe body="earth" size={size} still locked />;
}

function MeteorArt({ size = 74 }: { size?: number }) {
  const c = size / 2;
  const rays = [18, 52, 96, 140, 200, 250, 300, 340];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {rays.map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const from = 6 + (i % 3) * 3;
        const to = from + 14 + (i % 4) * 7;
        return (
          <line
            key={deg}
            x1={c + Math.cos(a) * from}
            y1={c + Math.sin(a) * from}
            x2={c + Math.cos(a) * to}
            y2={c + Math.sin(a) * to}
            stroke="oklch(0.95 0.02 300)"
            strokeOpacity={0.28 + (i % 3) * 0.2}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={c} cy={c} r="2.4" fill="oklch(0.96 0.03 300)" />
    </svg>
  );
}

/*
 * Tarcza planety.
 *
 * Dla ciał, dla których mamy mapę powierzchni, rysujemy prawdziwą kulę z tej mapy,
 * a Saturnowi dokładamy pierścienie. Kolorowy krążek mówił tylko tyle, że chodzi
 * o jakąś planetę; kula z pasami Jowisza albo pierścieniami Saturna mówi, o którą.
 * Mapy pochodzą ze zdjęć sond, więc jest to obraz rzeczywisty, a nie symbol.
 *
 * Globus jest nieruchomy: kilkanaście obracających się kul w jednym spisie kosztowałoby
 * więcej niż daje, a w karcie wydarzenia chodzi o rozpoznanie planety, nie o oglądanie jej.
 */
const MA_MAPE = new Set<BodyKey>([
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'sun',
]);

function BodyArt({ event, size = 74 }: { event: AstroEvent; size?: number }) {
  if (event.body && MA_MAPE.has(event.body)) {
    return <PlanetGlobe body={event.body} size={size} still />;
  }
  const color = event.body ? BODY_PROFILES[event.body].color : '#d9a441';
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <radialGradient id={`halo-${event.id}`}>
          <stop offset="30%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`cien-${event.id}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.28)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 0.35)" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={size * 0.44} fill={`url(#halo-${event.id})`} />
      <circle cx={c} cy={c} r={size * 0.21} fill={color} />
      <circle cx={c} cy={c} r={size * 0.21} fill={`url(#cien-${event.id})`} />
    </svg>
  );
}

/** Zaćmienie: dwie nakładające się tarcze. */
function EclipseArt({ event, size = 74 }: { event: AstroEvent; size?: number }) {
  const solar = event.kind === 'solar-eclipse';
  const c = size / 2;
  const r = size * 0.24;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <radialGradient id={`ecl-${event.id}`}>
          <stop offset="35%" stopColor={solar ? 'oklch(0.92 0.14 78)' : 'oklch(0.6 0.14 30)'} stopOpacity="0.5" />
          <stop offset="100%" stopColor={solar ? 'oklch(0.92 0.14 78)' : 'oklch(0.6 0.14 30)'} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={size * 0.46} fill={`url(#ecl-${event.id})`} />
      <circle cx={c} cy={c} r={r} fill={solar ? 'oklch(0.94 0.12 82)' : 'oklch(0.62 0.13 28)'} />
      <circle cx={c + r * 0.62} cy={c - r * 0.34} r={r} fill="oklch(0.16 0.02 262)" opacity={solar ? 1 : 0.82} />
    </svg>
  );
}

/*
 * Zdjęcia scen zamiast rysunku, ale tylko tam, gdzie rysunek nie może być wierny.
 *
 * Faza Księżyca i tarcze planet są liczone dla daty wydarzenia, więc rysunek mówi
 * prawdę o tym konkretnym dniu, a zdjęcie mówiłoby prawdę o dniu, w którym powstało.
 * Rój meteorów i zaćmienie to co innego: ich wygląd nie wynika z żadnej liczby,
 * którą umiemy podać, więc symbol jest tam tylko symbolem, a fotografia pokazuje,
 * czego się spodziewać na niebie.
 */
const SCENY: Partial<Record<AstroEvent['kind'], string>> = {
  'meteor-shower': 'scene:meteor-shower',
  'lunar-eclipse': 'scene:lunar-eclipse',
  'solar-eclipse': 'scene:solar-eclipse',
};

function Artwork({ event }: { event: AstroEvent }) {
  const photos = usePhotos();
  const klucz = SCENY[event.kind];
  const photo = klucz ? photos[klucz] : undefined;
  if (photo) {
    return (
      <span className={styles.artPhoto}>
        <PhotoThumb photo={photo} alt={event.title} size={74} />
      </span>
    );
  }

  switch (event.kind) {
    case 'moon-phase':
      return <MoonArt date={event.date} />;
    case 'conjunction':
      return <PairArt event={event} />;
    case 'season':
      return <SeasonArt />;
    case 'meteor-shower':
      return <MeteorArt />;
    case 'lunar-eclipse':
    case 'solar-eclipse':
      return <EclipseArt event={event} />;
    default:
      return <BodyArt event={event} />;
  }
}

export function EventCard({
  event,
  now,
  onSelect,
}: {
  event: AstroEvent;
  now: Date;
  onSelect: (event: AstroEvent) => void;
}) {
  const palette = PALETTES[event.kind] ?? PALETTES.apsis;
  return (
    <button
      type="button"
      className={styles.card}
      style={{
        background: `linear-gradient(118deg, ${palette.from} 0%, ${palette.to} 100%)`,
        color: palette.ink,
      }}
      onClick={() => onSelect(event)}
    >
      <span className={styles.text}>
        <span className={styles.when}>
          {formatWeekday(event.date)}, {formatDate(event.date)}
        </span>
        <span className={styles.title}>{event.title}</span>
        <span className={styles.meta}>
          {formatTime(event.date)} , {relativeDays(event.date, now)}
        </span>
      </span>
      <span className={styles.art} aria-hidden="true">
        <Artwork event={event} />
      </span>
    </button>
  );
}
