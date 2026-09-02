import { Link } from 'react-router-dom';

import { Panel } from '@/components/shell/Panel';
import { Chip, Icon, Stat } from '@/components/ui';
import { MAP_ATTRIBUTION } from '@/components/map/TileMap';
import { safeHref, SITE } from '@/config/site';
import { weatherProvider } from '@/lib/weather/openMeteo';

import type { SectionProps } from './shared';
import styles from './sections.module.css';

/*
 * Sekcja "O projekcie".
 *
 * Odpowiada na pytania, które ktoś realnie zadaje, zanim założy konto: kto to robi,
 * skąd biorą się liczby i co stanie się z moimi danymi. Ostatnie pytanie ma tu wagę
 * większą niż zwykle, bo aplikacja przechodzi właśnie z działania wyłącznie
 * w przeglądarce na wersję z serwerem i kontami, a to zmienia odpowiedź całkowicie.
 *
 * Ta sekcja nie zastępuje polityki prywatności ani regulaminu. Mówi o tym wprost,
 * zamiast udawać dokument, którym nie jest.
 */

const SOURCES: { name: string; licence: string; use: string }[] = [
  {
    name: 'astronomy-engine',
    licence: 'MIT',
    use: 'położenia Słońca, Księżyca i planet, wschody i zachody, fazy, zaćmienia, elongacje',
  },
  {
    name: 'HYG Database v41',
    licence: 'CC BY-SA 4.0',
    use: 'katalog 8920 gwiazd: położenia, jasności, odległości i typy widmowe',
  },
  {
    name: 'Stellarium',
    licence: 'CC BY-SA 4.0 dla danych kultur nieba',
    use: 'figury gwiazdozbiorów, granice Międzynarodowej Unii Astronomicznej, asteryzmy, nazwy i baza miejsc',
  },
  {
    name: 'Europejskie Obserwatorium Południowe',
    licence: 'CC BY 4.0',
    use: 'panorama Drogi Mlecznej, zdjęcie Serge Bruniera z projektu GigaGalaxy Zoom',
  },
  {
    name: 'Solar System Scope',
    licence: 'CC BY 4.0',
    use: 'mapy powierzchni planet i Księżyca',
  },
  { name: 'Celestrak', licence: 'domena publiczna', use: 'elementy orbitalne sztucznych satelitów' },
  { name: 'satellite.js', licence: 'MIT', use: 'model SGP4, czyli propagacja orbit satelitów' },
  { name: 'Open-Meteo', licence: 'CC BY 4.0', use: 'prognoza zachmurzenia i przejrzystości powietrza' },
  { name: 'OpenStreetMap', licence: 'ODbL', use: 'mapa z nazwami miejscowości' },
  { name: 'GeoNames', licence: 'CC BY 4.0', use: 'pisownia nazw miejscowości' },
];

function LinkRow({ channel }: { channel: { label: string; value: string; href?: string } }) {
  const href = safeHref(channel.href);
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon}>
        <Icon name="arrowUpRight" size={15} />
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{channel.label}</span>
        <span className={styles.rowSub}>
          {href ? (
            <a href={href} className={styles.link} target="_blank" rel="noreferrer noopener">
              {channel.value}
            </a>
          ) : (
            channel.value
          )}
        </span>
      </span>
    </div>
  );
}

export function AboutSection({ onClose }: SectionProps) {
  const contact = SITE.contact.filter((c) => c.value.trim().length > 0);

  return (
    <Panel eyebrow="O projekcie" title="AstroZenit" onClose={onClose} wide photoKey="scene:milky-way">
      <div className={styles.stack}>
        <p className={styles.lead}>
          AstroZenit pokazuje, co widać na niebie z konkretnego miejsca i o konkretnej porze.
          Nie jest to ilustracja ani animacja: każde położenie jest liczone z modeli ruchu
          ciał niebieskich w chwili, w której patrzysz na ekran.
        </p>

        <div className={styles.grid}>
          <Stat label="Gwiazd w katalogu" value="8 920" />
          <Stat label="Gwiazdozbiorów" value="88" />
          <Stat label="Obiektów Messiera" value="110" />
          <Stat label="Miejsc w bazie" value="4 070" />
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Kto to robi</p>
          <p className={styles.explainBody}>
            AstroZenit powstaje jako projekt dwójki studentów Politechniki Poznańskiej. Nie stoi
            za nim firma ani redakcja, więc nie ma tu reklam, śledzenia zachowań ani sprzedaży
            danych. Jest za to zwykła konsekwencja takiego układu: piszemy to po godzinach,
            poprawki bywają nierówno rozłożone w czasie, a zgłoszony błąd trafia wprost do osób,
            które go popełniły.
          </p>
          <p className={styles.explainBody}>
            Silnik rysujący niebo jest napisany od zera, a nie oparty na gotowym silniku
            Stellarium, którego licencja wymagałaby otwarcia źródeł całego serwisu. Wszystkie
            wzory, od pozycji planet po ocenę warunków obserwacyjnych, mają w kodzie
            uzasadnienie i zestaw kontroli porównujących wyniki z wartościami wzorcowymi.
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Zanim założysz konto</p>
          <p className={styles.explainBody}>
            AstroZenit działa dziś w całości w Twojej przeglądarce i nie ma serwera. Trwają prace
            nad wersją z kontami, w której będzie można zapisywać listy obserwacyjne
            i korzystać z tych samych danych na kilku urządzeniach. Poniżej jest opisane,
            co ta zmiana oznacza, żeby nikt nie zakładał konta w fałszywym przekonaniu.
          </p>

          <div className={styles.list}>
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>Co trafi na serwer</span>
                <span className={styles.rowSub}>
                  Adres poczty, nazwa widoczna dla innych, skrót hasła, daty logowań razem
                  z adresem sieciowym i rodzajem przeglądarki, oraz treści, które sam dodasz.
                  Nic więcej: mapa nieba, ustawienia warstw i miejsce obserwacji liczą się
                  i zostają na Twoim urządzeniu.
                </span>
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>Jak trzymane jest hasło</span>
                <span className={styles.rowSub}>
                  Nigdy w postaci jawnej. Do bazy trafia wyłącznie skrót policzony funkcją
                  Argon2id, zaprojektowaną tak, żeby liczyć się wolno. Znaczy to, że nawet
                  wyciek całej bazy nie daje nikomu Twojego hasła, i że my również nie możemy
                  go odczytać, a jedynie ustawić nowe.
                </span>
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>Sesja i ciasteczka</span>
                <span className={styles.rowSub}>
                  Jedno ciasteczko techniczne, niedostępne dla skryptów na stronie, służące
                  wyłącznie do utrzymania zalogowania. Żadnych ciasteczek reklamowych ani
                  analitycznych, więc nie ma tu też okienka proszącego o zgodę na śledzenie.
                </span>
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>Twoje prawa</span>
                <span className={styles.rowSub}>
                  Wgląd w swoje dane, poprawienie ich, pobranie w pliku i usunięcie konta
                  razem z treściami. Usunięcie jest nieodwracalne i wykonywane bez pytania
                  o powód. Wynika to z przepisów o ochronie danych osobowych i nie jest
                  uprzejmością z naszej strony.
                </span>
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>Czego nie robimy</span>
                <span className={styles.rowSub}>
                  Nie sprzedajemy ani nie udostępniamy danych, nie profilujemy zachowań,
                  nie wysyłamy wiadomości innych niż potwierdzenie adresu i odzyskiwanie
                  hasła. Do serwisu pogodowego trafiają wyłącznie współrzędne zaokrąglone
                  do około kilometra, bez żadnego identyfikatora.
                </span>
              </span>
            </div>
          </div>

          {/*
            * Streszczenie zostaje, bo odpowiada na pytanie zadawane najczęściej i od razu.
            * Zdanie o tym, że dokumentów jeszcze nie ma, zniknęło razem z ich napisaniem,
            * a jego miejsce zajęły odnośniki: kto chce pełnej treści, ma do niej jedno
            * kliknięcie, kto nie chce, czyta streszczenie i idzie dalej.
            */}
          <p className={styles.hint}>
            To streszczenie. Pełną treść znajdziesz w{' '}
            <Link to="/prywatnosc">polityce prywatności</Link> i w{' '}
            <Link to="/regulamin">regulaminie</Link>.
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Co liczy się na Twoim urządzeniu</p>
          <p className={styles.explainBody}>
            Prawie wszystko, i tak zostanie także po uruchomieniu kont. Położenia gwiazd,
            planet i Księżyca, wschody i zachody, fazy, zaćmienia, ocena warunków
            obserwacyjnych i cała mapa nieba powstają w przeglądarce, z danych wbudowanych
            w aplikację. Po pierwszym wczytaniu mapa nieba działa bez połączenia z internetem.
          </p>
          <p className={styles.explainBody}>
            Sieci wymagają tylko trzy rzeczy, i każda mówi o tym wprost, gdy jej brakuje:
            prognoza zachmurzenia, elementy orbitalne satelitów oraz kafelki mapy
            z nazwami miejscowości.
          </p>
        </div>

        <div>
          <p className={styles.sectionTitle}>Skąd pochodzą dane</p>
          <div className={styles.list}>
            {SOURCES.map((source) => (
              <div key={source.name} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{source.name}</span>
                  <span className={styles.rowSub}>{source.use}</span>
                </span>
                <span className={styles.rowNumbers}>
                  <span className={styles.rowValueMuted}>{source.licence}</span>
                </span>
              </div>
            ))}
          </div>
          <p className={styles.hint}>
            {MAP_ATTRIBUTION}. {weatherProvider.attribution}.
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <p className={styles.sectionTitle}>Kontakt</p>
          {contact.length > 0 ? (
            <div className={styles.list}>
              {contact.map((channel) => (
                <LinkRow key={channel.label} channel={channel} />
              ))}
            </div>
          ) : (
            <p className={styles.explainBody}>
              Domena serwisu jest w trakcie zakupu. Razem z nią pojawi się tu adres poczty
              w tej domenie i będzie to jedyny oficjalny kanał kontaktu z nami. Do tego czasu
              najpewniejszą drogą jest strona z pozostałymi projektami, podana niżej.
            </p>
          )}

          {SITE.links.length > 0 && (
            <div className={styles.list} style={{ marginTop: 'var(--space-3)' }}>
              {SITE.links.map((channel) => (
                <LinkRow key={channel.label} channel={channel} />
              ))}
            </div>
          )}

          <div className={styles.chipRow}>
            <Chip>projekt studencki</Chip>
            <Chip>Politechnika Poznańska</Chip>
          </div>
        </div>

        <p className={styles.hint}>
          Znalazłeś błąd w liczbach? To najcenniejsza informacja zwrotna, jaką można tu
          przesłać. Aplikacja ma zestaw kontroli porównujących wyniki z wartościami
          wzorcowymi, ale żadna kontrola nie zastąpi kogoś, kto stanął na dworze
          i porównał mapę z niebem.
        </p>
      </div>
    </Panel>
  );
}
