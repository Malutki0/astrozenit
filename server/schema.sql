-- Baza kont dla Zenitu.
--
-- Aplikacja działa dziś w całości w przeglądarce i sprawdza hasło na urządzeniu
-- użytkownika, co jest osłoną interfejsu, a nie ochroną danych. Ten plik opisuje
-- zaplecze, które to zmienia: konta, sesje i wszystko, co potrzebne do rejestracji,
-- logowania i odzyskiwania hasła.
--
-- Składnia PostgreSQL. Dla SQLite wystarczy zamienić typ uuid na text, timestamptz
-- na text i usunąć rozszerzenie pgcrypto; reszta przenosi się bez zmian.
--
-- ZASADA, KTÓRA NIE PODLEGA NEGOCJACJI
-- Hasło nigdy nie trafia do bazy. Trafia do niej wyłącznie skrót policzony funkcją
-- przeznaczoną do haseł, czyli Argon2id albo bcrypt. Skróty ogólnego przeznaczenia,
-- takie jak SHA-256, nie nadają się do tego celu: są zaprojektowane, żeby liczyć się
-- szybko, a przy hasłach chodzi dokładnie o odwrotność.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- konta

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Adres poczty w postaci znormalizowanej, czyli małymi literami i bez spacji.
  -- Osobna kolumna, a nie indeks funkcyjny, żeby ograniczenie unikalności było
  -- oczywiste przy czytaniu schematu.
  email           text NOT NULL,
  email_normalized text NOT NULL UNIQUE,

  -- Nazwa widoczna dla innych. Może się powtarzać, bo tożsamość ustala adres poczty.
  display_name    text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),

  -- Pełny zapis skrótu razem z parametrami i solą, w postaci zwracanej przez bibliotekę,
  -- na przykład $argon2id$v=19$m=65536,t=3,p=4$...$...
  -- Trzymanie parametrów przy skrócie pozwala zmienić je w przyszłości bez migracji:
  -- przy najbliższym poprawnym logowaniu skrót zostaje przeliczony na nowe parametry.
  password_hash   text NOT NULL,

  -- Rola. Celowo nie jest to typ wyliczeniowy, bo dodanie roli nie powinno wymagać
  -- zmiany typu w bazie, a lista i tak jest pilnowana w kodzie.
  role            text NOT NULL DEFAULT 'czytelnik'
                  CHECK (role IN ('czytelnik', 'redaktor', 'admin')),

  -- Potwierdzenie adresu. Konto niepotwierdzone może się zalogować, ale nie może pisać.
  email_verified_at timestamptz,

  -- Blokada po serii nieudanych prób. Liczona po stronie serwera, bo licznik po stronie
  -- przeglądarki użytkownik po prostu skasuje.
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,

  -- Miękkie usunięcie. Prawdziwe usunięcie wiersza zerwałoby powiązania z wpisami,
  -- a przy koncie z treścią to zwykle nie jest to, o co chodzi.
  deleted_at      timestamptz
);

CREATE INDEX users_role_idx ON users (role) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- sesje

-- Sesja jest wierszem w bazie, a nie samopotwierdzającym się tokenem, z jednego powodu:
-- tylko wtedy da się ją unieważnić natychmiast. Token podpisany kryptograficznie jest
-- ważny do wygaśnięcia i wylogowanie z jednego urządzenia nie ma jak go zatrzymać.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- W bazie leży skrót tokenu, nie sam token. Wyciek kopii bazy nie daje wtedy
  -- możliwości podszycia się pod zalogowanego użytkownika.
  token_hash    text NOT NULL UNIQUE,

  -- Do pokazania listy "gdzie jestem zalogowany".
  user_agent    text,
  ip_address    inet,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- ------------------------------------------------- tokeny jednorazowe

-- Wspólna tablica na potwierdzenie adresu i na odzyskiwanie hasła. Oba przypadki mają
-- ten sam kształt: jednorazowy sekret z terminem ważności, przypisany do konta.
CREATE TABLE tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('potwierdzenie-adresu', 'reset-hasla')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tokens_user_purpose_idx ON tokens (user_id, purpose);

-- --------------------------------------------------------- dziennik zdarzeń

-- Zapis prób logowania i zmian konta. Potrzebny do dwóch rzeczy: do rozpoznania ataku
-- polegającego na sprawdzaniu tego samego hasła na wielu kontach oraz do odpowiedzi
-- na pytanie użytkownika "kto się logował na moje konto".
CREATE TABLE auth_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Adres poczty zapisujemy osobno, bo zdarzenie może dotyczyć konta, które nie istnieje.
  email_tried text,
  kind        text NOT NULL CHECK (kind IN (
                'logowanie-udane', 'logowanie-nieudane', 'rejestracja',
                'zmiana-hasla', 'reset-zadany', 'reset-wykonany', 'wylogowanie'
              )),
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_events_created_idx ON auth_events (created_at DESC);
CREATE INDEX auth_events_ip_idx ON auth_events (ip_address, created_at DESC);

-- ----------------------------------------------- powiązanie z aktualnościami

-- Wpisy przenoszone z pamięci przeglądarki na zaplecze. Kolumny odpowiadają polom
-- z src/lib/news.ts, więc przeniesienie danych to prosty odczyt pliku eksportu.
CREATE TABLE posts (
  id          text PRIMARY KEY,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  lead        text NOT NULL CHECK (length(lead) <= 500),
  body        text NOT NULL CHECK (length(body) <= 60000),
  category    text NOT NULL,
  source_url  text CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  cover_id    text,
  published_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_published_idx ON posts (published_at DESC);

CREATE TABLE post_images (
  id          text PRIMARY KEY,
  post_id     text REFERENCES posts(id) ON DELETE CASCADE,
  position    int NOT NULL,
  -- Ścieżka w magazynie plików. Obrazów nie trzymamy w bazie: baza jest do danych,
  -- które się przeszukuje, a nie do plików, które się serwuje.
  storage_key text NOT NULL,
  alt         text NOT NULL DEFAULT '',
  width       int NOT NULL,
  height      int NOT NULL,
  bytes       int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_images_post_idx ON post_images (post_id, position);

-- ---------------------------------------------------------------- sprzątanie

-- Wygasłe sesje i zużyte tokeny nie mają wartości, a rosną w nieskończoność.
-- Do uruchamiania raz na dobę.
--
--   DELETE FROM sessions WHERE expires_at < now() - interval '30 days';
--   DELETE FROM tokens   WHERE expires_at < now() - interval '30 days';
--   DELETE FROM auth_events WHERE created_at < now() - interval '180 days';

-- ------------------------------------------------------------- ulubione

-- Lista obserwacyjna użytkownika.
--
-- Odwołanie do obiektu zapisujemy jako tekst w tej samej postaci, której używa
-- aplikacja po stronie przeglądarki: "star:32349", "dso:M31", "body:saturn".
-- Nie rozbijamy go na rodzaj i identyfikator w osobnych kolumnach, i to jest
-- świadomy wybór. Baza nigdy nie musi zajrzeć do środka tego napisu: nie sortuje
-- po nim, nie filtruje po rodzaju obiektu i nie łączy go z żadną inną tabelą,
-- bo katalog nieba w całości leży w aplikacji, a nie tutaj. Rozbicie dołożyłoby
-- kolumnę, więzy i ryzyko rozjechania się dwóch zapisów tego samego, nie dając
-- w zamian żadnego zapytania, którego dziś nie da się wykonać.
--
-- Klucz główny złożony z użytkownika i obiektu załatwia dwie rzeczy naraz:
-- ten sam obiekt nie trafi na listę dwa razy, a odczyt całej listy jednego
-- użytkownika idzie po kluczu, bez osobnego indeksu.
CREATE TABLE favourites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_ref  text NOT NULL CHECK (object_ref ~ '^(star|dso|body|constellation|asterism|satellite):[A-Za-z0-9_. -]{1,40}$'),
  -- Nazwa w chwili dodania. Zapisana po to, żeby lista dała się wyświetlić
  -- i wyszukać bez wczytywania całego katalogu, na przykład w powiadomieniu
  -- albo w eksporcie danych, do którego użytkownik ma prawo.
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  -- Własna notatka. Najczęstsze zastosowanie listy obserwacyjnej to zapisanie,
  -- czego się przy obiekcie szukało i czym się go oglądało.
  note        text CHECK (note IS NULL OR length(note) <= 2000),
  -- Czy obiekt został już zaobserwowany. Lista pełni wtedy podwójną rolę:
  -- planu na przyszłość i dziennika tego, co się widziało.
  observed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, object_ref)
);

-- Sortowanie listy od ostatnio dodanych. Bez tego indeksu odczyt wymagałby
-- posortowania całej listy użytkownika przy każdym otwarciu sekcji.
CREATE INDEX favourites_recent_idx ON favourites (user_id, created_at DESC);

-- ============================================================================
-- ZGODY I DOKUMENTY
-- ============================================================================

-- Przyjęcie regulaminu i polityki prywatności.
--
-- Osobna tabela, a nie kolumna w users, i to jest decyzja świadoma. Kolumna
-- przechowywałaby wyłącznie stan bieżący, czyli odpowiedź na pytanie "czy się zgodził".
-- Przy dokumencie, który się zmienia, potrzebna jest odpowiedź na pytanie trudniejsze:
-- "na którą wersję się zgodził i kiedy". Bez historii nie da się jej udzielić, a przy
-- sporze albo przy kontroli to jest właśnie pytanie, które padnie.
--
-- Wiersze zostają po zmianie wersji dokumentu. Nowa zgoda to nowy wiersz, nie nadpisanie.
CREATE TABLE consents (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 'regulamin' albo 'prywatnosc'. Rozdzielone, bo to dwa osobne dokumenty
  -- i mogą się zmieniać niezależnie od siebie.
  document    text NOT NULL CHECK (document IN ('regulamin', 'prywatnosc')),
  -- Wersja dokumentu z config/legal.ts, na przykład '1.0'.
  version     text NOT NULL CHECK (length(version) BETWEEN 1 AND 20),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  -- Adres zapisujemy skrótem, nie jawnie. Do wykazania, że zgoda padła z konkretnej
  -- sesji, skrót wystarcza, a jawny adres byłby kolejną daną osobową trzymaną bez potrzeby.
  ip_hash     text
);

CREATE INDEX consents_user_idx ON consents (user_id, document, accepted_at DESC);

-- Ostatnia przyjęta wersja każdego dokumentu, do sprawdzenia przy logowaniu.
-- Widok, a nie kolumna, żeby nie było dwóch miejsc mówiących to samo i mogących
-- się rozjechać.
CREATE VIEW current_consents AS
SELECT DISTINCT ON (user_id, document)
  user_id, document, version, accepted_at
FROM consents
ORDER BY user_id, document, accepted_at DESC;

-- ============================================================================
-- USUWANIE KONTA
-- ============================================================================

-- Prawo do usunięcia danych jest bezwarunkowe, więc droga do niego musi działać sama,
-- bez pisania do nas. Kolumna deleted_at w users daje usunięcie miękkie, przydatne przy
-- pomyłce, ale nie spełnia obowiązku: dane dalej leżą w bazie.
--
-- Ta procedura kasuje naprawdę. Ulubione i sesje znikają kaskadą, wpisy autorstwa
-- użytkownika zostają bez autora, bo są treścią serwisu, a nie jego daną osobową.
-- Zgody zostają w postaci pozbawionej powiązania z osobą, bo dowód przyjęcia regulaminu
-- jest potrzebny także po odejściu użytkownika, a sam w sobie nikogo już nie wskazuje.
CREATE OR REPLACE FUNCTION delete_user_account(target uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE posts SET author_id = NULL WHERE author_id = target;
  UPDATE consents SET user_id = NULL, ip_hash = NULL WHERE user_id = target;
  DELETE FROM users WHERE id = target;
END;
$$;

-- Powyższe wymaga, żeby consents.user_id dopuszczał brak wartości, a odwołanie
-- nie kasowało wiersza razem z użytkownikiem.
ALTER TABLE consents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE consents DROP CONSTRAINT consents_user_id_fkey;
ALTER TABLE consents ADD CONSTRAINT consents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- ============================================================================
-- SPRZĄTANIE
-- ============================================================================

-- Zapisy o logowaniach kasujemy po dziewięćdziesięciu dniach, zgodnie z tym,
-- co obiecuje polityka prywatności. Obietnica bez zadania, które ją wykonuje,
-- jest tylko zdaniem na stronie.
CREATE OR REPLACE FUNCTION purge_old_auth_events()
RETURNS integer
LANGUAGE sql
AS $$
  WITH usuniete AS (
    DELETE FROM auth_events WHERE created_at < now() - interval '90 days' RETURNING 1
  )
  SELECT count(*)::integer FROM usuniete;
$$;
