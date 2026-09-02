import { useMemo, useState } from 'react';

import { Panel } from '@/components/shell/Panel';
import { Chip, Icon, PhotoFrame, Stat } from '@/components/ui';
import { METEOR_SHOWERS } from '@/lib/astro/constants';
import { positionOfFixed, toObserver } from '@/lib/astro/ephemeris';
import { generateEvents } from '@/lib/astro/events';
import type { AstroEvent } from '@/lib/astro/types';
import { formatDate, formatDegrees, formatTime, relativeDays } from '@/lib/format';
import { useSkyStore } from '@/state/useSkyStore';

import type { SectionProps } from './shared';
import { PlanetGlobe } from '@/components/panels/PlanetGlobe';
import { usePhotos } from '@/state/usePhotos';
import styles from './sections.module.css';

/*
 * Sekcja "Zjawiska astronomiczne".
 *
 * Odpowiada na pytanie CO, a nie KIEDY. Kiedy co wypada, mówi Kalendarz i to on jest
 * chronologicznym spisem dat.
 *
 * Wcześniej obie sekcje pokazywały tę samą płaską listę wydarzeń z tej samej funkcji
 * i pokrywały się w dziewięćdziesięciu sześciu procentach, co znaczyło, że jedna z nich
 * była zbędna. Tutaj zostaje więc wyłącznie to, czego kalendarz z natury nie pokaże:
 * czym dane zjawisko jest, dlaczego wygląda tak, a nie inaczej, i na co zwrócić uwagę
 * przy obserwacji. Daty są tylko dodatkiem do wyjaśnienia, a nie jego treścią.
 */

type Group = 'roje' | 'zacmienia' | 'planety' | 'pory';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'roje', label: 'Roje meteorów' },
  { id: 'zacmienia', label: 'Zaćmienia' },
  { id: 'planety', label: 'Planety' },
  { id: 'pory', label: 'Pory roku' },
];

/*
 * Wyjaśnienia zjawisk.
 *
 * Pisane tak, żeby odpowiadały na pytanie, które zadaje ktoś, kto pierwszy raz słyszy
 * daną nazwę. Bez wzorów, ale i bez upraszczania do nieprawdy.
 */
const EXPLANATIONS: Record<Group, { lead: string; body: string[] }> = {
  roje: {
    lead: 'Ziemia raz w roku przecina ślad pyłu zostawiony przez kometę albo planetoidę.',
    body: [
      'Ziarna pyłu wielkości ziarenka piasku wpadają w atmosferę z prędkością kilkudziesięciu kilometrów na sekundę i spalają się na wysokości około stu kilometrów. Świeci nie samo ziarno, tylko rozgrzane powietrze wzdłuż jego toru.',
      'Wszystkie meteory z jednego roju wybiegają pozornie z jednego punktu, zwanego radiantem. To złudzenie perspektywy, takie samo jak zbieganie się szyn kolejowych na horyzoncie: tory są równoległe, a wydają się schodzić w jeden punkt.',
      'Im wyżej nad horyzontem stoi radiant, tym więcej meteorów widać, bo tym mniejsza część roju wpada w Ziemię poniżej linii horyzontu. Dlatego większość rojów najlepiej obserwuje się nad ranem.',
    ],
  },
  zacmienia: {
    lead: 'Zaćmienie zachodzi wtedy, gdy Słońce, Ziemia i Księżyc ustawiają się w jednej linii.',
    body: [
      'Zaćmienie Księżyca wypada zawsze podczas pełni, a zaćmienie Słońca zawsze podczas nowiu. Nie zdarzają się co miesiąc, bo orbita Księżyca jest nachylona do orbity Ziemi o pięć stopni, więc zwykle cień mija cel.',
      'Zaćmienie Księżyca widać z całej półkuli, na której akurat jest noc, i trwa nawet kilka godzin. Zaćmienie Słońca widać z wąskiego pasa i całkowita faza trwa najwyżej kilka minut, dlatego stopień zakrycia liczymy tu dla dokładnych współrzędnych Twojego miejsca obserwacji.',
      'Zaćmiony Księżyc czerwienieje, bo jedyne światło, które do niego dociera, przechodzi przez atmosferę Ziemi i traci po drodze barwy krótkofalowe. To ten sam mechanizm, który czerwieni zachód Słońca.',
    ],
  },
  planety: {
    lead: 'Dwa układy Słońca, planety i Ziemi wyznaczają najlepsze momenty na obserwację planet.',
    body: [
      'Opozycja dotyczy planet zewnętrznych, od Marsa dalej. Planeta stoi wtedy po przeciwnej stronie nieba niż Słońce, więc jest najbliżej Ziemi, świeci najjaśniej i jest nad horyzontem przez całą noc. To najlepszy moment w całym cyklu.',
      'Największa elongacja dotyczy Merkurego i Wenus, czyli planet krążących bliżej Słońca niż Ziemia. Z naszej perspektywy nigdy nie oddalają się od Słońca bardziej niż o kilkadziesiąt stopni, więc widać je tylko krótko po zachodzie albo przed wschodem Słońca. Elongacja to chwila największego oddalenia, czyli najdogodniejsza do obserwacji.',
      'Zbliżenie, po łacinie koniunkcja, to pozorne spotkanie dwóch ciał na niebie. Pozorne, bo w przestrzeni dzielą je zwykle setki milionów kilometrów. Efektowne i łatwe do dostrzeżenia gołym okiem.',
    ],
  },
  pory: {
    lead: 'Oś obrotu Ziemi jest nachylona o dwadzieścia trzy i pół stopnia i to nachylenie rządzi całym rokiem obserwacyjnym.',
    body: [
      'W przesileniu letnim Słońce w środku nocy schodzi w Polsce najwyżej kilkanaście stopni pod horyzont, przez co noc astronomiczna w ogóle nie zapada i przez kilka tygodni nie da się obserwować najsłabszych obiektów.',
      'W przesileniu zimowym ciemność trwa ponad czternaście godzin. To najlepszy okres w roku na obserwacje, choć okupiony mrozem i częstszym zachmurzeniem.',
      'Równonoc jesienna jest umownym początkiem sezonu: od niej noce są dłuższe od dni.',
    ],
  },
};

/** Czy dzisiejsza data mieści się w zakresie aktywności roju. */
function isActive(shower: (typeof METEOR_SHOWERS)[number], date: Date): boolean {
  const day = (m: number, d: number) => m * 100 + d;
  const now = day(date.getMonth() + 1, date.getDate());
  const from = day(shower.activeFrom[0], shower.activeFrom[1]);
  const to = day(shower.activeTo[0], shower.activeTo[1]);
  /* Roje przechodzące przez przełom roku wymagają odwrotnego porównania. */
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

/** Krótki wiersz z najbliższym wystąpieniem zjawiska danego rodzaju. */
function NextEvent({
  event,
  now,
  onPick,
}: {
  event: AstroEvent;
  now: Date;
  onPick: (date: Date) => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={() => onPick(event.date)}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {event.title}
          {event.rank === 1 && <Chip tone="accent">ważne</Chip>}
        </span>
        <span className={styles.rowSub}>{event.detail}</span>
      </span>
      <span className={styles.rowNumbers}>
        <span className={styles.rowValue}>{formatDate(event.date)}</span>
        <span className={styles.rowValueMuted}>{relativeDays(event.date, now)}</span>
      </span>
    </button>
  );
}

/*
 * Zdjęcie otwierające wyjaśnienie każdej grupy zjawisk.
 *
 * Cztery bloki tekstu różniące się wyłącznie treścią wyglądały identycznie, więc
 * przełączanie zakładek nie dawało poczucia, że cokolwiek się zmieniło. Fotografia
 * na wejściu mówi o czym będzie mowa, zanim padnie pierwsze zdanie, i to jest jedyna
 * rzecz, którą obraz robi lepiej od tekstu.
 *
 * Pory roku dostają Ziemię z mapy powierzchni zamiast fotografii, bo równonoc
 * i przesilenie to nie zjawisko na niebie, tylko położenie osi obrotu naszej planety.
 */
const ZDJECIA_GRUP: Record<Group, string | null> = {
  roje: 'scene:meteor-shower',
  zacmienia: 'scene:lunar-eclipse',
  planety: 'scene:planets',
  pory: null,
};

function Explanation({ group }: { group: Group }) {
  const text = EXPLANATIONS[group];
  const photos = usePhotos();
  const photo = ZDJECIA_GRUP[group] ? photos[ZDJECIA_GRUP[group] as string] : undefined;

  return (
    <div className={styles.explain}>
      {photo ? (
        <PhotoFrame photo={photo} alt={text.lead} ratio="21 / 9" />
      ) : (
        <div className={styles.explainGlobe}>
          <PlanetGlobe body="earth" size={132} still />
        </div>
      )}
      <p className={styles.explainLead}>{text.lead}</p>
      {text.body.map((paragraph, i) => (
        <p key={i} className={styles.explainBody}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function PhenomenaSection({ onClose }: SectionProps) {
  const date = useSkyStore((s) => s.date);
  const location = useSkyStore((s) => s.location);
  const setDate = useSkyStore((s) => s.setDate);
  const focusOn = useSkyStore((s) => s.focusOn);
  const [group, setGroup] = useState<Group>('roje');

  /*
   * Zjawiska szukamy na trzy lata naprzód, bo zaćmienie widoczne z danego miejsca
   * potrafi się nie zdarzyć przez ponad rok, a sekcja ma odpowiadać na pytanie
   * "kiedy najbliższe", a nie "czy w tym półroczu wypada".
   * Zbliżenia pomijamy: jest ich dużo, są chronologiczne i należą do Kalendarza.
   */
  const events = useMemo(() => {
    const observer = toObserver(location);
    return generateEvents(date, new Date(date.getTime() + 1100 * 86400000), observer, {
      includeConjunctions: false,
    });
  }, [date, location]);

  const byKind = useMemo(() => {
    const pick = (kinds: AstroEvent['kind'][], limit: number) =>
      events.filter((e) => kinds.includes(e.kind)).slice(0, limit);
    return {
      lunar: pick(['lunar-eclipse'], 3),
      solar: pick(['solar-eclipse'], 3),
      opposition: pick(['opposition'], 6),
      elongation: pick(['elongation'], 6),
      season: pick(['season'], 4),
    };
  }, [events]);

  const showers = useMemo(() => {
    const observer = toObserver(location);
    return METEOR_SHOWERS.map((shower) => {
      const radiant = positionOfFixed(shower.radiantRa, shower.radiantDec, date, observer);
      const year = date.getFullYear();
      let peak = new Date(year, shower.peakMonth - 1, shower.peakDay, 2, 0, 0);
      if (peak < date) peak = new Date(year + 1, shower.peakMonth - 1, shower.peakDay, 2, 0, 0);
      return { shower, radiant, peak, active: isActive(shower, date) };
    }).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.peak.getTime() - b.peak.getTime();
    });
  }, [date, location]);

  return (
    <Panel
      eyebrow={location.label}
      title="Zjawiska astronomiczne"
      onClose={onClose}
      wide
      photoKey="scene:meteor-shower"
    >
      <div className={styles.stack}>
        <p className={styles.lead}>
          Czym są zjawiska widoczne na niebie i na co zwrócić uwagę przy ich obserwacji.
          Pełny spis dat, dzień po dniu, jest w Kalendarzu wydarzeń.
        </p>

        <div className={styles.chips}>
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`${styles.chipButton} ${group === g.id ? styles.chipButtonActive : ''}`}
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
            >
              {g.label}
            </button>
          ))}
        </div>

        <Explanation group={group} />

        {group === 'roje' && (
          <>
            <div className={styles.divider} />
            <div className={styles.stackTight}>
              {showers.map(({ shower, radiant, peak, active }) => (
                <div key={shower.id} className={styles.showerCard}>
                  <div className={styles.showerHead}>
                    <div style={{ minWidth: 0 }}>
                      <p className={styles.showerName}>{shower.name}</p>
                      <p className={styles.rowSub}>
                        maksimum {formatDate(peak)} , {relativeDays(peak, date)}
                      </p>
                    </div>
                    {active ? (
                      <Chip tone="visible" dot>
                        aktywny
                      </Chip>
                    ) : (
                      <Chip tone="neutral">poza sezonem</Chip>
                    )}
                  </div>
                  <div className={styles.grid}>
                    <Stat label="Meteorów na godzinę" value={`do ${shower.zhr}`} />
                    <Stat label="Prędkość" value={`${shower.velocityKms} km/s`} />
                    <Stat
                      label="Radiant teraz"
                      value={
                        radiant.altitude > 0 ? formatDegrees(radiant.altitude, 0) : 'pod horyzontem'
                      }
                    />
                  </div>
                  <p className={styles.hint} style={{ marginTop: 0 }}>
                    {shower.note} Ciało macierzyste: {shower.parent}.
                  </p>
                  {radiant.altitude > 0 && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => focusOn(radiant.azimuth, radiant.altitude, 60)}
                    >
                      Pokaż radiant na mapie
                      <Icon name="arrowUpRight" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.hint}>
              Podana liczba meteorów na godzinę zakłada idealnie ciemne niebo i radiant
              w zenicie. W praktyce zobaczysz mniej, tym mniej, im niżej jest radiant
              i im jaśniejszy Księżyc.
            </p>
          </>
        )}

        {group === 'zacmienia' && (
          <>
            <div className={styles.divider} />
            <div>
              <p className={styles.sectionTitle}>Najbliższe zaćmienia Księżyca</p>
              {byKind.lunar.length === 0 ? (
                <p className={styles.hint} style={{ marginTop: 0 }}>
                  W ciągu najbliższych trzech lat nie wypada żadne zaćmienie Księżyca.
                </p>
              ) : (
                <div className={styles.list}>
                  {byKind.lunar.map((e) => (
                    <NextEvent key={e.id} event={e} now={date} onPick={setDate} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className={styles.sectionTitle}>Najbliższe zaćmienia Słońca z Twojego miejsca</p>
              {byKind.solar.length === 0 ? (
                <p className={styles.hint} style={{ marginTop: 0 }}>
                  Z tych współrzędnych w ciągu najbliższych trzech lat nie będzie widać
                  żadnego zaćmienia Słońca, nawet częściowego.
                </p>
              ) : (
                <div className={styles.list}>
                  {byKind.solar.map((e) => (
                    <NextEvent key={e.id} event={e} now={date} onPick={setDate} />
                  ))}
                </div>
              )}
              <p className={styles.hint}>
                Podany stopień zakrycia dotyczy dokładnie współrzędnych {location.label},
                a nie kraju czy regionu. Kilkadziesiąt kilometrów dalej wartość bywa inna.
                Obserwacja wyłącznie przez certyfikowany filtr słoneczny: patrzenie w Słońce
                przez lornetkę albo teleskop bez filtru trwale uszkadza wzrok w ułamku sekundy.
              </p>
            </div>
          </>
        )}

        {group === 'planety' && (
          <>
            <div className={styles.divider} />
            <div>
              <p className={styles.sectionTitle}>Najbliższe opozycje planet</p>
              <div className={styles.list}>
                {byKind.opposition.map((e) => (
                  <NextEvent key={e.id} event={e} now={date} onPick={setDate} />
                ))}
              </div>
            </div>
            <div>
              <p className={styles.sectionTitle}>Największe elongacje Merkurego i Wenus</p>
              <div className={styles.list}>
                {byKind.elongation.map((e) => (
                  <NextEvent key={e.id} event={e} now={date} onPick={setDate} />
                ))}
              </div>
              <p className={styles.hint}>
                Kliknięcie wiersza ustawia mapę nieba na tę datę, więc od razu widać,
                gdzie planeta będzie stała i o której godzinie warto wyjść.
              </p>
            </div>
          </>
        )}

        {group === 'pory' && (
          <>
            <div className={styles.divider} />
            <div>
              <p className={styles.sectionTitle}>Najbliższe przesilenia i równonoce</p>
              <div className={styles.list}>
                {byKind.season.map((e) => (
                  <div key={e.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{e.title}</span>
                      <span className={styles.rowSub}>{e.detail}</span>
                    </span>
                    <span className={styles.rowNumbers}>
                      <span className={styles.rowValue}>{formatDate(e.date)}</span>
                      <span className={`${styles.rowValueMuted} num`}>{formatTime(e.date)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
