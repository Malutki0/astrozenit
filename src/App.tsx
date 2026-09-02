import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createHashRouter, RouterProvider, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/shell/AppShell';
import { Panel } from '@/components/shell/Panel';
import { LocationPicker } from '@/components/sky/LocationPicker';
import { LayersSection } from '@/components/sections/Layers';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { Button, Skeleton } from '@/components/ui';
import type { CatalogBundle } from '@/lib/catalog/types';
import { useCatalog } from '@/state/useCatalog';

import styles from './App.module.css';

/* Sekcje z cięższą treścią wczytujemy dopiero przy pierwszym wejściu,
 * dzięki czemu pierwsze uruchomienie mapy pozostaje szybkie. */
const TonightSection = lazy(() =>
  import('@/components/sections/Tonight').then((m) => ({ default: m.TonightSection })),
);
const PlanetsSection = lazy(() =>
  import('@/components/sections/Planets').then((m) => ({ default: m.PlanetsSection })),
);
const StarsSection = lazy(() =>
  import('@/components/sections/Stars').then((m) => ({ default: m.StarsSection })),
);
const ConstellationsSection = lazy(() =>
  import('@/components/sections/Constellations').then((m) => ({ default: m.ConstellationsSection })),
);
const MoonSection = lazy(() =>
  import('@/components/sections/Moon').then((m) => ({ default: m.MoonSection })),
);
const FavouritesSection = lazy(() =>
  import('@/components/sections/Favourites').then((m) => ({ default: m.FavouritesSection })),
);
const PhenomenaSection = lazy(() =>
  import('@/components/sections/Phenomena').then((m) => ({ default: m.PhenomenaSection })),
);
const CalendarSection = lazy(() =>
  import('@/components/sections/Calendar').then((m) => ({ default: m.CalendarSection })),
);
const CloudsSection = lazy(() =>
  import('@/components/sections/Clouds').then((m) => ({ default: m.CloudsSection })),
);
const SatellitesSection = lazy(() =>
  import('@/components/sections/Satellites').then((m) => ({ default: m.SatellitesSection })),
);
const AboutSection = lazy(() =>
  import('@/components/sections/About').then((m) => ({ default: m.AboutSection })),
);

/* Aktualności są pełnymi podstronami, a nie panelami nad mapą,
 * bo tekst do czytania potrzebuje szerokości i spokojnego tła. */
const NewsListPage = lazy(() =>
  import('@/components/news/NewsPage').then((m) => ({ default: m.NewsListPage })),
);
const CompassDiagnosticsSection = lazy(() =>
  import('@/components/sections/CompassDiagnostics').then((m) => ({
    default: m.CompassDiagnosticsSection,
  })),
);
const TermsSection = lazy(() =>
  import('@/components/sections/Legal').then((m) => ({ default: m.TermsSection })),
);
const PrivacySection = lazy(() =>
  import('@/components/sections/Legal').then((m) => ({ default: m.PrivacySection })),
);
const NewsArticlePage = lazy(() =>
  import('@/components/news/NewsPage').then((m) => ({ default: m.NewsArticlePage })),
);
const FeedArticlePage = lazy(() =>
  import('@/components/news/NewsPage').then((m) => ({ default: m.FeedArticlePage })),
);
const NewsEditorPage = lazy(() =>
  import('@/components/news/NewsPage').then((m) => ({ default: m.NewsEditorPage })),
);
const AccountPage = lazy(() =>
  import('@/components/news/AccountPage').then((m) => ({ default: m.AccountPage })),
);

function PanelFallback({ title }: { title: string }) {
  return (
    <Panel title={title} onClose={() => history.back()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Skeleton height={54} />
        <Skeleton height={54} />
        <Skeleton height={54} />
        <Skeleton height={54} />
      </div>
    </Panel>
  );
}

/** Otacza sekcję obsługą zamykania, która zawsze wraca na mapę. */
function SectionRoute({
  title,
  render,
}: {
  title: string;
  render: (props: { onClose: () => void; catalog: CatalogBundle }) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const { catalog } = useCatalog();
  const onClose = useCallback(() => navigate('/'), [navigate]);
  if (!catalog) return <PanelFallback title={title} />;
  return <Suspense fallback={<PanelFallback title={title} />}>{render({ onClose, catalog })}</Suspense>;
}

function Layout() {
  const { status, catalog, error } = useCatalog();
  const [searchOpen, setSearchOpen] = useState(false);

  /* Skrót klawiaturowy do wyszukiwarki działa wszędzie poza polami tekstowymi. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status === 'error') {
    return (
      <div className={styles.boot}>
        <div className={styles.bootInner}>
          <p className={styles.bootTitle}>Nie udało się wczytać katalogu nieba</p>
          <p className={styles.bootBody}>
            {error?.message ?? 'Nieznany błąd.'} Sprawdź połączenie i spróbuj ponownie.
          </p>
          <Button variant="primary" onClick={() => location.reload()}>
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'loading' || !catalog) {
    return (
      <div className={styles.boot}>
        <div className={styles.bootInner}>
          <span className={styles.bootMark} aria-hidden="true" />
          <p className={styles.bootTitle}>AstroZenit</p>
          <p className={styles.bootBody}>Wczytuję katalog nieba</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell catalog={catalog} onSearch={() => setSearchOpen(true)} />
      {searchOpen && <CommandPalette catalog={catalog} onClose={() => setSearchOpen(false)} />}
    </>
  );
}

/*
 * Strona nieznanego adresu.
 *
 * Bez niej React Router pokazywał własną stronę awaryjną, napisaną dla programisty:
 * "Unexpected Application Error", zachętę do dodania errorElement i emoji, którego
 * w tym projekcie nie ma nigdzie indziej. Odwiedzający, który trafi tu z literówką
 * albo ze starego odnośnika, ma dostać zdanie po polsku i drogę powrotną, a nie
 * komunikat diagnostyczny.
 */
function NotFound() {
  const navigate = useNavigate();
  return (
    <Panel eyebrow="Nie znaleziono" title="Nie ma takiej strony" onClose={() => navigate('/')}>
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '52ch' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Adres, pod który trafiłeś, nie odpowiada żadnej sekcji AstroZenitu. Mógł się
          zmienić albo zawierać literówkę. Mapa nieba działa niezależnie od tego i czeka
          pod przyciskiem poniżej.
        </p>
        <div>
          <Button variant="primary" onClick={() => navigate('/')}>
            Wróć na mapę nieba
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: null },
      {
        path: 'dzis',
        element: (
          <SectionRoute
            title="Dziś w nocy"
            render={({ onClose, catalog }) => <TonightSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'planety',
        element: (
          <SectionRoute
            title="Planety"
            render={({ onClose, catalog }) => <PlanetsSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'gwiazdy',
        element: (
          <SectionRoute
            title="Gwiazdy"
            render={({ onClose, catalog }) => <StarsSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'konstelacje',
        element: (
          <SectionRoute
            title="Konstelacje"
            render={({ onClose, catalog }) => (
              <ConstellationsSection onClose={onClose} catalog={catalog} />
            )}
          />
        ),
      },
      {
        path: 'ksiezyc',
        element: (
          <SectionRoute
            title="Księżyc"
            render={({ onClose, catalog }) => <MoonSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'zjawiska',
        element: (
          <SectionRoute
            title="Zjawiska astronomiczne"
            render={({ onClose, catalog }) => (
              <PhenomenaSection onClose={onClose} catalog={catalog} />
            )}
          />
        ),
      },
      {
        path: 'kalendarz',
        element: (
          <SectionRoute
            title="Kalendarz wydarzeń"
            render={({ onClose, catalog }) => <CalendarSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'chmury',
        element: (
          <SectionRoute
            title="Chmury"
            render={({ onClose, catalog }) => <CloudsSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'satelity',
        element: (
          <SectionRoute
            title="Satelity"
            render={({ onClose, catalog }) => (
              <SatellitesSection onClose={onClose} catalog={catalog} />
            )}
          />
        ),
      },
      {
        path: 'o-projekcie',
        element: (
          <SectionRoute
            title="O projekcie"
            render={({ onClose, catalog }) => <AboutSection onClose={onClose} catalog={catalog} />}
          />
        ),
      },
      {
        path: 'aktualnosci',
        element: (
          <Suspense fallback={null}>
            <NewsListPage />
          </Suspense>
        ),
      },
      {
        path: 'aktualnosci/panel',
        element: (
          <Suspense fallback={null}>
            <NewsEditorPage />
          </Suspense>
        ),
      },
      {
        /* Wiadomość pobrana z zewnątrz. Osobna ścieżka, bo te wpisy nie leżą w pamięci
         * przeglądarki razem z wpisami własnymi, tylko w pliku odświeżanym co dobę. */
        path: 'aktualnosci/z/:id',
        element: (
          <Suspense fallback={null}>
            <FeedArticlePage />
          </Suspense>
        ),
      },
      {
        path: 'aktualnosci/:id',
        element: (
          <Suspense fallback={null}>
            <NewsArticlePage />
          </Suspense>
        ),
      },
      {
        path: 'konto',
        element: (
          <Suspense fallback={null}>
            <AccountPage />
          </Suspense>
        ),
      },
      {
        path: 'ulubione',
        element: (
          <SectionRoute
            title="Ulubione"
            render={({ onClose, catalog }) => (
              <FavouritesSection onClose={onClose} catalog={catalog} />
            )}
          />
        ),
      },
      {
        path: 'regulamin',
        element: <SectionRoute title="Regulamin" render={({ onClose }) => <TermsSection onClose={onClose} />} />,
      },
      {
        path: 'prywatnosc',
        element: <SectionRoute title="Prywatność" render={({ onClose }) => <PrivacySection onClose={onClose} />} />,
      },
      { path: 'warstwy', element: <LayersRoute /> },
      { path: 'lokalizacja', element: <LocationRoute /> },
      /* Strona diagnostyczna czujnika. Nie ma jej w nawigacji, bo służy do jednej rzeczy:
       * ustalenia, co wysyła konkretne urządzenie, gdy kompas zachowuje się dziwnie. */
      {
        path: 'diagnostyka',
        element: (
          <SectionRoute
            title="Diagnostyka"
            render={({ onClose }) => <CompassDiagnosticsSection onClose={onClose} />}
          />
        ),
      },
      /* Musi stać na końcu: gwiazdka łapie wszystko, czego nie złapały trasy wyżej. */
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function LayersRoute() {
  const navigate = useNavigate();
  return <LayersSection onClose={() => navigate('/')} />;
}

function LocationRoute() {
  const navigate = useNavigate();
  return (
    <Panel eyebrow="Skąd patrzysz" title="Miejsce obserwacji" onClose={() => navigate('/')}>
      <LocationPicker />
    </Panel>
  );
}

export function App() {
  return <RouterProvider router={router} />;
}
