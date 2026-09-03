import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { SkyCanvas } from '@/components/sky/SkyCanvas';
import { CompassButton } from '@/components/sky/CompassButton';
import { NightTimeline } from '@/components/sky/NightTimeline';
import { ObjectPanel } from '@/components/panels/ObjectPanel';
import { CookieBanner } from './CookieBanner';
import { Icon, IconButton, type IconName } from '@/components/ui';
import type { CatalogBundle } from '@/lib/catalog/types';
import { bortleInfo } from '@/lib/catalog/locations';
import { formatTime } from '@/lib/format';
import { useSkyStore } from '@/state/useSkyStore';
import { useSatelliteStore } from '@/state/useSatellites';
import { useCompactLayout } from '@/state/useCompactLayout';
import { useAuthStore } from '@/state/useAuth';
import { useFavouritesStore } from '@/state/useFavourites';
import { startWeather } from '@/state/useWeather';

import { GlassFilter } from './GlassFilter';
import styles from './AppShell.module.css';

export interface SectionRoute {
  path: string;
  label: string;
  /** Etykieta w szynie bocznej, gdzie miejsca jest niewiele. */
  short: string;
  icon: IconName;
  wide?: boolean;
}

export const SECTIONS: SectionRoute[] = [
  { path: '/', label: 'Mapa nieba', short: 'Mapa', icon: 'map' },
  { path: '/dzis', label: 'Dziś w nocy', short: 'Dziś', icon: 'eye', wide: true },
  { path: '/planety', label: 'Planety', short: 'Planety', icon: 'planet' },
  { path: '/gwiazdy', label: 'Gwiazdy', short: 'Gwiazdy', icon: 'star' },
  { path: '/konstelacje', label: 'Konstelacje', short: 'Figury', icon: 'constellation', wide: true },
  { path: '/ksiezyc', label: 'Księżyc', short: 'Księżyc', icon: 'moon' },
  { path: '/zjawiska', label: 'Zjawiska astronomiczne', short: 'Zjawiska', icon: 'sparkle', wide: true },
  { path: '/satelity', label: 'Satelity', short: 'Satelity', icon: 'satellite' },
  { path: '/chmury', label: 'Chmury i warunki', short: 'Chmury', icon: 'cloud', wide: true },
  { path: '/kalendarz', label: 'Kalendarz wydarzeń', short: 'Kalendarz', icon: 'calendar', wide: true },
  { path: '/aktualnosci', label: 'Aktualności', short: 'Newsy', icon: 'news' },
];

export const TOOLS: SectionRoute[] = [
  { path: '/warstwy', label: 'Warstwy mapy', short: 'Warstwy', icon: 'layers' },
  { path: '/lokalizacja', label: 'Miejsce obserwacji', short: 'Miejsce', icon: 'location' },
  { path: '/konto', label: 'Konto', short: 'Konto', icon: 'user' },
  /* Lista obserwacyjna stoi bezpośrednio pod kontem, bo do niego należy:
   * bez zalogowania sekcja mówi tylko tyle, że wymaga konta. */
  { path: '/ulubione', label: 'Lista obserwacyjna', short: 'Ulubione', icon: 'star' },
  { path: '/o-projekcie', label: 'O projekcie', short: 'O nas', icon: 'info', wide: true },
  /*
   * Dokumenty na końcu szyny, poniżej wszystkiego innego.
   *
   * Nie dlatego, że są mało ważne, tylko dlatego, że tak się z nich korzysta: sięga się
   * po nie raz, wtedy gdy się o coś pyta, a nie w trakcie obserwacji. Muszą być
   * znalezialne bez szukania w wyszukiwarce i to jest cały wymóg wobec ich miejsca.
   */
  { path: '/regulamin', label: 'Regulamin', short: 'Regulamin', icon: 'info', wide: true },
  { path: '/prywatnosc', label: 'Prywatność', short: 'Prywatność', icon: 'lock', wide: true },
];

/*
 * PASEK ZAKŁADEK NA WĄSKIM EKRANIE
 *
 * Sekcji jest piętnaście i wszystkie stały w jednym rzędzie przewijanym w bok.
 * Wzorzec sprzed dekady, i to nie z powodu wyglądu, tylko dlatego, że nie działa:
 * w kadrze mieści się siedem pozycji, więc ośmiu pozostałych po prostu nie widać,
 * a nic nie mówi, że tam są. Kto ich nie zna, nie dowie się, że istnieją.
 *
 * Pasek zakładek ma pokazywać wszystko, co pokazuje, a nie zapowiadać, że gdzieś
 * dalej jest więcej. Dlatego zostają cztery pozycje najczęściej używane i piąta,
 * która otwiera resztę. Cztery to nie jest liczba wzięta z powietrza: przy pięciu
 * pozycjach na ekranie szerokim na trzysta siedemdziesiąt pięć pikseli na jedną
 * wypada siedemdziesiąt pięć, czyli podpis mieści się w jednym wierszu i cel dotyku
 * ma wymagane czterdzieści cztery piksele.
 */
const GLOWNE: string[] = ['/', '/dzis', '/planety', '/kalendarz'];

function Rail() {
  const waski = useCompactLayout();
  const [wiecej, setWiecej] = useState(false);
  const routerLocation = useLocation();
  const przyciskWiecej = useRef<HTMLButtonElement>(null);

  /* Zamknięcie po przejściu do sekcji: arkusz zrobił swoje i ma zejść z drogi. */
  useEffect(() => setWiecej(false), [routerLocation.pathname]);

  /*
   * Zamknięcie bez przechodzenia dalej, czyli klawiszem Escape albo dotknięciem obok.
   * Fokus wraca na przycisk, który arkusz otworzył. Bez tego osoba na klawiaturze
   * po zamknięciu lądowała na początku dokumentu i musiała przechodzić tabulatorem
   * przez cały interfejs, żeby wrócić w to samo miejsce. Przy przejściu do sekcji
   * fokusu nie ruszamy, bo uwaga ma zostać na nowej treści.
   */
  const zamknijArkusz = useCallback(() => {
    setWiecej(false);
    przyciskWiecej.current?.focus();
  }, []);

  useEffect(() => {
    if (!wiecej) return undefined;
    const naKlawisz = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      zamknijArkusz();
    };
    /* Nasłuch w fazie przechwytywania, żeby Escape zamknął arkusz, a nie panel pod nim. */
    window.addEventListener('keydown', naKlawisz, true);
    return () => window.removeEventListener('keydown', naKlawisz, true);
  }, [wiecej, zamknijArkusz]);

  const render = (item: SectionRoute) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => `${styles.railItem} ${isActive ? styles.railItemActive : ''}`}
      title={item.label}
    >
      <Icon name={item.icon} size={19} />
      <span className={styles.railLabel}>{item.short}</span>
    </NavLink>
  );

  if (!waski) {
    return (
      <nav className={styles.rail} aria-label="Sekcje aplikacji">
        {SECTIONS.map(render)}
        <span className={styles.railDivider} aria-hidden="true" />
        {TOOLS.map(render)}
      </nav>
    );
  }

  const glowne = GLOWNE.map((p) => SECTIONS.find((s) => s.path === p)).filter(
    (s): s is SectionRoute => Boolean(s),
  );
  const reszta = [...SECTIONS.filter((s) => !GLOWNE.includes(s.path)), ...TOOLS];
  /* Podświetlamy przycisk reszty, gdy otwarta sekcja pochodzi właśnie stamtąd.
   * Bez tego pasek pokazywałby, że nie jesteśmy nigdzie. */
  const wResztcie = reszta.some((s) => routerLocation.pathname === s.path);

  return (
    <>
      <nav className={styles.rail} aria-label="Sekcje aplikacji">
        {glowne.map(render)}
        <button
          type="button"
          ref={przyciskWiecej}
          className={`${styles.railItem} ${wiecej || wResztcie ? styles.railItemActive : ''}`}
          onClick={() => setWiecej((v) => !v)}
          aria-expanded={wiecej}
          aria-label="Pozostałe sekcje"
        >
          <Icon name={wiecej ? 'close' : 'menu'} size={19} />
          <span className={styles.railLabel}>Więcej</span>
        </button>
      </nav>

      {wiecej && (
        <>
          {/* Tło przechwytujące dotknięcie poza arkuszem. Zamknięcie przez dotknięcie
            * obok jest tu jedynym gestem, którego użytkownik spodziewa się bez wyjaśnień. */}
          <button
            type="button"
            className={styles.moreScrim}
            onClick={zamknijArkusz}
            aria-label="Zamknij spis sekcji"
          />
          <nav className={styles.moreSheet} aria-label="Pozostałe sekcje">
            <span className={styles.moreHandle} aria-hidden="true" />
            <div className={styles.moreGrid}>{reszta.map(render)}</div>
          </nav>
        </>
      )}
    </>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const location = useSkyStore((s) => s.location);
  const date = useSkyStore((s) => s.date);
  const live = useSkyStore((s) => s.live);
  const goToNow = useSkyStore((s) => s.goToNow);
  const navigate = useNavigate();
  const info = bortleInfo(location.bortle);

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandName}>AstroZenit</span>
        <span className={styles.brandDot} aria-hidden="true" />
      </div>

      <button
        type="button"
        className={styles.topbarButton}
        onClick={() => navigate('/lokalizacja')}
        /*
         * Podpis obok ikony chowa się w układzie telefonu, więc bez aria-label zostawał
         * tam przycisk bez nazwy. Nazwa niesie miejsce, bo sam atrybut title czytniki
         * ekranu traktują różnie i nie można na nim opierać nazwy dostępnej.
         */
        aria-label={`Miejsce obserwacji: ${location.label}. Skala Bortle'a ${location.bortle}: ${info.label}. Zmień miejsce`}
        title={`Skala Bortle'a ${location.bortle}: ${info.label}`}
      >
        <Icon name="location" size={15} />
        <span className={styles.topbarLabel}>{location.label}</span>
      </button>

      <span className={styles.topbarTime}>
        <button
          type="button"
          className={styles.topbarButton}
          onClick={() => navigate('/')}
          aria-label={`Godzina na mapie: ${formatTime(date)}. ${live ? 'Czas bieżący' : 'Czas ustawiony ręcznie'}. Przejdź do mapy`}
          title={live ? 'Czas bieżący' : 'Czas ustawiony ręcznie'}
        >
          <Icon name="clock" size={15} />
          <span className={`${styles.topbarLabel} num`}>{formatTime(date)}</span>
        </button>
        {/*
          * Powrót do czasu bieżącego musi być podpisany słowem, a nie samą ikoną zegara.
          * Po przewinięciu osi czasu trzeba od razu widzieć, że mapa pokazuje inną godzinę,
          * i mieć jedno oczywiste wyjście z tego stanu.
          */}
        {!live && (
          <button
            type="button"
            className={styles.liveButton}
            onClick={goToNow}
            title="Wróć do czasu bieżącego"
          >
            <span className={styles.liveDot} aria-hidden="true" />
            Na żywo
          </button>
        )}
      </span>

      <div className={styles.topbarSpacer} />

      <div className={styles.topbarGroup}>
        {/* Kompas pokazuje się wyłącznie na urządzeniu dotykowym z czujnikiem orientacji. */}
        <CompassButton />
        <button type="button" className={styles.searchButton} onClick={onSearch}>
          <Icon name="search" size={15} />
          <span className={styles.searchLabel}>Szukaj obiektu</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
        <IconButton
          icon="search"
          label="Szukaj obiektu na niebie"
          onClick={onSearch}
          className={styles.searchCompact}
        />
      </div>
    </header>
  );
}

export function AppShell({
  catalog,
  onSearch,
}: {
  catalog: CatalogBundle;
  onSearch: () => void;
}) {
  const selected = useSkyStore((s) => s.selected);
  const routerLocation = useLocation();

  /* Prognozę pobieramy raz przy uruchomieniu. Kolejne pobrania wywołuje zmiana miejsca. */
  useEffect(() => {
    startWeather();
  }, []);

  /* Tryb czerwony ustawiamy atrybutem na dokumencie, bo filtr musi objąć całą stronę,
   * razem z płótnem mapy nieba i z kafelkami mapy. */
  const nightMode = useSkyStore((s) => s.nightMode);
  useEffect(() => {
    document.documentElement.dataset.trybNocny = nightMode ? '1' : '0';
    return () => {
      delete document.documentElement.dataset.trybNocny;
    };
  }, [nightMode]);

  /*
   * Elementy orbitalne pobieramy dopiero przy włączeniu warstwy satelitów.
   * Mapa nieba ma działać bez sieci, więc nie sięgamy po nic, czego użytkownik nie chce.
   */
  const satelliteLayer = useSkyStore((s) => s.layers.satellites);
  const loadSatelliteSet = useSatelliteStore((s) => s.load);
  useEffect(() => {
    if (satelliteLayer) void loadSatelliteSet();
  }, [satelliteLayer, loadSatelliteSet]);

  /*
   * Lista obserwacyjna idzie za zalogowaniem. Wylogowanie ma odciąć do niej dostęp,
   * a nie tylko schować przycisk: na wspólnym komputerze to jest różnica między
   * prywatnością a jej pozorem.
   */
  const session = useAuthStore((s) => s.session);
  const syncFavourites = useFavouritesStore((s) => s.sync);
  useEffect(() => {
    syncFavourites(session?.login ?? null);
  }, [session, syncFavourites]);
  /* Panel obiektu ustępuje miejsca sekcjom na wąskich ekranach, żeby dwa panele
   * nie walczyły o tę samą przestrzeń. */
  const sectionOpen = routerLocation.pathname !== '/';
  /* Aktualności są pełną podstroną, a nie panelem nad mapą. Oś czasu i panel obiektu
   * nie mają tam czego szukać, bo dotyczą nieba, a nie czytanego tekstu. */
  const fullPage =
    routerLocation.pathname.startsWith('/aktualnosci') || routerLocation.pathname.startsWith('/konto');

  return (
    <div className={styles.shell}>
      {/* Definicje filtrów szkła. Muszą stać w drzewie dokumentu, żeby arkusze
        * stylów mogły się do nich odwołać, ale nie zajmują miejsca ani nie są widoczne. */}
      <GlassFilter />

      <div className={styles.sky}>
        <SkyCanvas catalog={catalog} />
      </div>

      <a href="#tresc" className="skip-link">
        Przejdź do treści
      </a>

      <TopBar onSearch={onSearch} />
      <Rail />

      <main id="tresc">
        <Outlet />
      </main>

      {selected && !fullPage && <ObjectPanel catalog={catalog} hiddenOnNarrow={sectionOpen} />}

      {/*
        * Pasek informacyjny pokazuje się raz, przy pierwszym wejściu, i nie wraca.
        *
        * Wyłącznie nad mapą. Przy otwartej sekcji zasłaniał jej nagłówek, bo na wąskim
        * ekranie panel zajmuje całą wysokość i nie ma miejsca, w które pasek mógłby wejść
        * niczego nie przykrywając. Nad mapą takie miejsce jest, bo mapa jest tłem.
        */}
      {!sectionOpen && <CookieBanner />}

      {!fullPage && (
        <div className={`${styles.dock} ${sectionOpen ? styles.dockHidden : ''}`}>
          <NightTimeline />
        </div>
      )}
    </div>
  );
}
