import { Panel } from '@/components/shell/Panel';
import { Icon } from '@/components/ui';
import { LEGAL, legalReady, RECIPIENTS } from '@/config/legal';
import { safeHref, SITE } from '@/config/site';

import styles from './sections.module.css';

/*
 * Regulamin i polityka prywatności.
 *
 * Dwa osobne dokumenty, bo odpowiadają na dwa różne pytania. Regulamin mówi, na jakich
 * zasadach wolno korzystać z serwisu. Polityka prywatności mówi, co dzieje się z danymi.
 * Łączenie ich w jeden plik jest wygodne dla piszącego i uciążliwe dla czytającego,
 * który zwykle szuka jednej konkretnej rzeczy.
 *
 * Treść opisuje to, co aplikacja naprawdę robi, i była pisana z kodem obok. Lista
 * odbiorców danych w config/legal.ts odpowiada miejscom, w których aplikacja faktycznie
 * wychodzi na zewnątrz, a nie temu, co się komuś wydaje.
 *
 * Tożsamość administratora, adres i data wejścia w życie są puste, dopóki ktoś ich nie
 * uzupełni. Dokument mówi o tym wprost i przedstawia się jako projekt. Wpisanie tam
 * zmyślonych danych dałoby dokument wyglądający na obowiązujący, a bezwartościowy,
 * i to jest gorsze niż widoczna luka.
 */

function Braki() {
  if (legalReady) return null;
  return (
    <div className={styles.legalDraft}>
      <p className={styles.legalDraftTitle}>
        <Icon name="info" size={15} /> To jest projekt dokumentu, jeszcze nieobowiązujący
      </p>
      <p>
        Brakuje danych, których nie da się wyprowadzić z kodu i których nie wolno zmyślić:
        kto formalnie odpowiada za dane, pod jakim adresem i od kiedy dokument obowiązuje.
        Uzupełnia się je w pliku <code>src/config/legal.ts</code>. Do tego czasu dokument
        opisuje faktyczne działanie serwisu, ale nie jest wiążącym zobowiązaniem.
      </p>
    </div>
  );
}

function Naglowek({ tytul }: { tytul: string }) {
  return <p className={styles.sectionTitle}>{tytul}</p>;
}

function Administrator() {
  if (!legalReady) return null;
  return (
    <p className={styles.explainBody}>
      Administratorem danych jest {LEGAL.administrator}
      {LEGAL.address ? `, ${LEGAL.address}` : ''}. W sprawach dotyczących danych osobowych
      pisz na {LEGAL.contactEmail}. Dokument obowiązuje od {LEGAL.effectiveFrom}, wersja{' '}
      {LEGAL.version}.
    </p>
  );
}

/* ------------------------------------------------------------------ regulamin */

export function TermsSection({ onClose }: { onClose: () => void }) {
  return (
    <Panel eyebrow="Dokumenty" title="Regulamin" onClose={onClose} wide>
      <div className={styles.stack}>
        <Braki />
        <Administrator />

        <div>
          <Naglowek tytul="1. Czym jest AstroZenit" />
          <p className={styles.explainBody}>
            AstroZenit to bezpłatny serwis do planowania obserwacji nocnego nieba. Pokazuje
            położenie ciał niebieskich, wschody i zachody, fazy Księżyca, przeloty satelitów,
            prognozę zachmurzenia oraz wiadomości astronomiczne. Powstaje jako projekt
            studencki i nie jest usługą świadczoną w celach zarobkowych.
          </p>
        </div>

        <div>
          <Naglowek tytul="2. Korzystanie bez konta" />
          <p className={styles.explainBody}>
            Wszystkie obliczenia astronomiczne, mapa nieba, kalendarz i prognoza są dostępne
            bez zakładania konta i bez podawania jakichkolwiek danych. Konto służy wyłącznie
            do zapisywania własnej listy obiektów do obserwacji.
          </p>
        </div>

        <div>
          <Naglowek tytul="3. Konto" />
          <p className={styles.explainBody}>
            Zakładając konto, podajesz nazwę użytkownika i hasło. Odpowiadasz za zachowanie
            hasła w tajemnicy. Jedno konto należy do jednej osoby. Konto możesz usunąć
            w każdej chwili, bez podawania powodu i bez kontaktu z nami. Usunięcie jest
            nieodwracalne i obejmuje wszystkie zapisane obiekty oraz notatki.
          </p>
          <p className={styles.explainBody}>
            Możemy usunąć konto, które służy do rozsyłania treści bezprawnych, do prób
            zakłócenia działania serwisu albo do obchodzenia zabezpieczeń. Zawiadamiamy
            o tym na adres podany przy rejestracji, o ile został podany.
          </p>
        </div>

        <div>
          <Naglowek tytul="4. Dokładność danych astronomicznych" />
          <p className={styles.explainBody}>
            Położenia ciał niebieskich liczy biblioteka astronomy-engine, a katalog gwiazd
            pochodzi z bazy HYG. Wyniki są dokładne na tyle, na ile pozwalają te źródła,
            i wystarczają do obserwacji okiem, lornetką i amatorskim teleskopem. Nie wolno
            ich używać do nawigacji ani do żadnego zastosowania, w którym błąd wyliczenia
            zagraża zdrowiu, życiu albo mieniu.
          </p>
          <p className={styles.explainBody}>
            Prognoza zachmurzenia pochodzi z serwisu Open-Meteo i jest prognozą, a nie
            pomiarem. Liczona jest w siatce o oczku około siedemdziesięciu kilometrów,
            więc mówi o pogodzie w regionie, a nie nad konkretną miejscowością.
          </p>
        </div>

        <div>
          <Naglowek tytul="5. Aktualności i cudze treści" />
          <p className={styles.explainBody}>
            Wiadomości pochodzą z dwóch źródeł i są traktowane różnie, bo różne są prawa
            do nich. Teksty NASA są w Stanach Zjednoczonych dobrem publicznym, więc
            publikujemy je w całości, w tłumaczeniu na polski, z podaniem źródła.
            Z serwisów objętych prawem autorskim, na przykład z AstroNETu, pokazujemy
            wyłącznie tytuł, krótką zajawkę i odnośnik prowadzący do wydawcy.
          </p>
          <p className={styles.explainBody}>
            Za treści u wydawców odpowiadają wydawcy. Jeżeli uważasz, że coś tu narusza
            Twoje prawa, napisz, a materiał zostanie usunięty do czasu wyjaśnienia sprawy.
          </p>
        </div>

        <div>
          <Naglowek tytul="6. Dostępność serwisu" />
          <p className={styles.explainBody}>
            Serwis jest udostępniany w takiej postaci, w jakiej jest, bez gwarancji ciągłości
            działania. Może być wyłączony na czas prac albo z powodu awarii u dostawców,
            od których pobiera dane. Nie odpowiadamy za nieudaną obserwację, przejazd
            w wybrane miejsce ani inne skutki oparcia się na prognozie albo na wyliczeniu.
          </p>
        </div>

        <div>
          <Naglowek tytul="7. Zmiany regulaminu" />
          <p className={styles.explainBody}>
            O zmianie informujemy w serwisie z co najmniej czternastodniowym wyprzedzeniem.
            Dalsze korzystanie po tym terminie oznacza przyjęcie nowej wersji. Jeżeli się na
            nią nie zgadzasz, możesz usunąć konto, a korzystać z serwisu dalej bez konta.
          </p>
        </div>

        <div>
          <Naglowek tytul="8. Prawo i spory" />
          <p className={styles.explainBody}>
            Stosuje się prawo polskie. Nic w tym regulaminie nie ogranicza praw
            przysługujących konsumentowi na podstawie przepisów bezwzględnie obowiązujących.
            Spraw dotyczących danych osobowych dotyczy osobny dokument, polityka prywatności.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- polityka prywatności */

export function PrivacySection({ onClose }: { onClose: () => void }) {
  const kontakt = SITE.contact.find((c) => c.href?.startsWith('mailto:'));

  return (
    <Panel eyebrow="Dokumenty" title="Prywatność" onClose={onClose} wide>
      <div className={styles.stack}>
        <Braki />
        <Administrator />

        <div>
          <Naglowek tytul="Zasada, na której to stoi" />
          <p className={styles.explainBody}>
            Serwis zbiera tyle danych, ile jest potrzebne, żeby działał, i ani jednej więcej.
            Nie ma tu analityki, nie ma śledzenia, nie ma reklam i nie ma profilowania.
            Wszystkie obliczenia astronomiczne wykonuje Twoja przeglądarka, więc położenie,
            czas i wybrane ustawienia nie muszą nigdzie wyjeżdżać, żeby mapa nieba zadziałała.
          </p>
        </div>

        <div>
          <Naglowek tytul="Co zostaje na Twoim urządzeniu" />
          <p className={styles.explainBody}>
            W pamięci przeglądarki zapisujemy ustawienia widoku, wybrane miejsce obserwacji,
            listę ulubionych obiektów i, po zalogowaniu, informację o trwającej sesji.
            Te dane nie są nigdzie wysyłane. Wyczyszczenie danych witryny usuwa je
            bezpowrotnie, razem z kontem założonym lokalnie.
          </p>
        </div>

        <div>
          <Naglowek tytul="Co przetwarzamy przy koncie" />
          <p className={styles.explainBody}>
            Nazwę użytkownika, nazwę wyświetlaną, jeżeli ją podasz, oraz skrót hasła.
            Samego hasła nie znamy i nie da się go odtworzyć ze skrótu. Do tego listę
            obiektów, które sam dodałeś, razem z notatkami i datami obserwacji.
            Podstawą jest wykonanie umowy o świadczenie usługi, czyli prowadzenie konta.
          </p>
        </div>

        <div>
          <Naglowek tytul="Dokąd wychodzą dane" />
          <p className={styles.explainBody}>
            Cztery połączenia na zewnątrz i tyle. Każde odpowiada konkretnej funkcji:
          </p>
          <div className={styles.list}>
            {RECIPIENTS.map((r) => (
              <div className={styles.row} key={r.name}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{r.name}</span>
                  <span className={styles.rowSub}>
                    {r.purpose}. Przekazywane: {r.data}.{' '}
                    <a href={safeHref(r.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                      zasady tego serwisu
                    </a>
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className={styles.explainBody}>
            Współrzędne wysyłane do serwisu pogodowego są przycinane do dwóch miejsc po
            przecinku, czyli około 1,1 kilometra. Prognoza i tak jest liczona w siatce
            o oczku kilkunastu kilometrów, więc dokładniejsze położenie niczego by w niej
            nie zmieniło, a wskazywałoby konkretny budynek.
          </p>
        </div>

        <div>
          <Naglowek tytul="Ciasteczka" />
          <p className={styles.explainBody}>
            Serwis nie używa ciasteczek analitycznych, reklamowych ani śledzących.
            Po uruchomieniu kont po stronie serwera pojawi się jedno ciasteczko techniczne,
            niedostępne dla skryptów na stronie, służące wyłącznie do utrzymania zalogowania.
            Ciasteczko konieczne do działania funkcji, o którą sam prosisz, nie wymaga zgody,
            wymaga natomiast poinformowania, i temu służy ten akapit.
          </p>
        </div>

        <div>
          <Naglowek tytul="Jak długo trzymamy dane" />
          <p className={styles.explainBody}>
            Dane konta trzymamy tak długo, jak istnieje konto. Po jego usunięciu znikają
            razem z nim, bez okresu przejściowego. Zapisy o logowaniach, służące wykrywaniu
            prób włamania, kasujemy po dziewięćdziesięciu dniach.
          </p>
        </div>

        <div>
          <Naglowek tytul="Twoje prawa" />
          <p className={styles.explainBody}>
            Masz prawo do wglądu w swoje dane, ich poprawienia, usunięcia, ograniczenia
            przetwarzania, przeniesienia do innego serwisu oraz do sprzeciwu. Usunięcie konta
            wykonasz sam, bez pytania nas o zgodę i bez podawania powodu. Przysługuje Ci też
            skarga do Prezesa Urzędu Ochrony Danych Osobowych.
          </p>
          <p className={styles.explainBody}>
            {LEGAL.contactEmail
              ? `W sprawach danych osobowych pisz na ${LEGAL.contactEmail}.`
              : kontakt
                ? `Do czasu uruchomienia adresu w domenie serwisu pisz na ${kontakt.value}.`
                : 'Adres do spraw danych osobowych pojawi się razem z domeną serwisu.'}
          </p>
        </div>

        <div>
          <Naglowek tytul="Dzieci" />
          <p className={styles.explainBody}>
            Serwis jest dla każdego, ale konto zakłada się samodzielnie. Osoba poniżej
            szesnastego roku życia powinna zrobić to za wiedzą opiekuna. Bez konta serwis
            działa w pełni i nie zbiera niczego.
          </p>
        </div>
      </div>
    </Panel>
  );
}
