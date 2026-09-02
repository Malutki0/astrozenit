-- =============================================================================
-- AstroZenit: schemat bazy dla MySQL
-- =============================================================================
--
-- Odpowiednik server/schema.sql, przepisany na MySQL 8. Powstał, bo polskie hostingi
-- współdzielone dają w pakiecie MySQL z phpMyAdminem i to jest baza, którą się tam
-- naprawdę dostaje, a nie PostgreSQL.
--
-- CO SIĘ ZMIENIŁO WZGLĘDEM WERSJI POSTGRESOWEJ I DLACZEGO
--
-- Typ uuid nie istnieje w MySQL. Używamy CHAR(36) i generujemy identyfikator funkcją
-- UUID() w wyzwalaczu albo w kodzie. Można by trzymać BINARY(16), oszczędniej i szybciej,
-- ale wtedy każdy podgląd w phpMyAdminie pokazuje śmieci, a przy projekcie, który ktoś
-- będzie oglądał ręcznie, czytelność jest warta tych kilkunastu bajtów.
--
-- Typ timestamptz nie istnieje. MySQL ma TIMESTAMP przechowywany w UTC i przeliczany
-- na strefę połączenia, więc daje to samo, pod warunkiem że połączenie ustawia strefę.
-- Serwer robi to przy każdym połączeniu, patrz server/php/db.php.
--
-- Typ text bez długości jest w MySQL osobnym typem, którego nie da się zindeksować
-- w całości. Wszędzie, gdzie potrzebny jest indeks albo unikalność, stoi VARCHAR
-- z jawną długością.
--
-- Ograniczenia CHECK działają dopiero od MySQL 8.0.16. Na starszej wersji zostaną
-- zignorowane bez ostrzeżenia, więc te same zasady pilnuje też kod serwera. Sprawdź
-- wersję poleceniem SELECT VERSION().
--
-- Uruchomienie w phpMyAdminie: zakładka Import, wybierz ten plik, wykonaj.
-- Uruchomienie z wiersza poleceń: mysql -u uzytkownik -p nazwa_bazy < schema-mysql.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =============================================================================
-- KONTA
-- =============================================================================

CREATE TABLE users (
  id                CHAR(36) NOT NULL PRIMARY KEY,

  -- Adres poczty w postaci pierwotnej i znormalizowanej, czyli małymi literami
  -- i bez spacji. Osobna kolumna, a nie indeks funkcyjny, żeby unikalność była
  -- widoczna przy czytaniu schematu.
  email             VARCHAR(320) NOT NULL,
  email_normalized  VARCHAR(320) NOT NULL,

  -- Nazwa widoczna dla innych. Może się powtarzać, bo tożsamość ustala adres poczty.
  display_name      VARCHAR(60) NOT NULL,

  -- Pełny zapis skrótu razem z parametrami i solą, w postaci zwracanej przez
  -- password_hash w PHP, na przykład $argon2id$v=19$m=65536,t=3,p=4$...$...
  -- Trzymanie parametrów przy skrócie pozwala je w przyszłości zmienić bez migracji:
  -- przy najbliższym poprawnym logowaniu skrót zostaje przeliczony na nowe.
  password_hash     VARCHAR(255) NOT NULL,

  role              VARCHAR(16) NOT NULL DEFAULT 'czytelnik',

  -- Potwierdzenie adresu. Konto niepotwierdzone może się zalogować, ale nie może pisać.
  email_verified_at TIMESTAMP NULL DEFAULT NULL,

  -- Blokada po serii nieudanych prób. Liczona po stronie serwera, bo licznik
  -- po stronie przeglądarki użytkownik po prostu skasuje.
  failed_attempts   INT NOT NULL DEFAULT 0,
  locked_until      TIMESTAMP NULL DEFAULT NULL,

  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at     TIMESTAMP NULL DEFAULT NULL,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,

  UNIQUE KEY users_email_uniq (email_normalized),
  KEY users_role_idx (role),
  CONSTRAINT users_role_chk CHECK (role IN ('czytelnik', 'redaktor', 'admin')),
  CONSTRAINT users_name_chk CHECK (CHAR_LENGTH(display_name) BETWEEN 2 AND 60)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- SESJE
-- =============================================================================
--
-- W bazie leży wyłącznie skrót żetonu sesji, nigdy sam żeton. Ktoś, kto zdobędzie odczyt
-- z bazy, nie może się dzięki temu podszyć pod zalogowanego, bo ze skrótu nie da się
-- odtworzyć żetonu. To ta sama zasada co przy hasłach i z tego samego powodu.

CREATE TABLE sessions (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  user_id       CHAR(36) NOT NULL,
  token_hash    CHAR(64) NOT NULL,

  -- Do pokazania użytkownikowi listy jego sesji i do rozpoznania podejrzanej.
  user_agent    VARCHAR(255) NULL,
  ip_hash       CHAR(64) NULL,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    TIMESTAMP NOT NULL,
  revoked_at    TIMESTAMP NULL DEFAULT NULL,

  UNIQUE KEY sessions_token_uniq (token_hash),
  KEY sessions_user_idx (user_id),
  KEY sessions_expiry_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- ŻETONY JEDNORAZOWE
-- =============================================================================
--
-- Potwierdzenie adresu i odzyskiwanie hasła. Tak samo jak przy sesjach, w bazie leży
-- wyłącznie skrót. Żeton wysłany pocztą jest jedynym miejscem, w którym istnieje jawnie.

CREATE TABLE tokens (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  purpose     VARCHAR(24) NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP NULL DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY tokens_hash_uniq (token_hash),
  KEY tokens_user_purpose_idx (user_id, purpose),
  CONSTRAINT tokens_purpose_chk CHECK (purpose IN ('potwierdzenie', 'reset')),
  CONSTRAINT tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- ZDARZENIA UWIERZYTELNIANIA
-- =============================================================================
--
-- Do wykrywania prób włamania i do odpowiedzi na pytanie "kto i kiedy się logował".
-- Adres zapisujemy skrótem, nie jawnie: do rozpoznania serii prób z jednego miejsca
-- skrót wystarcza, a jawny adres byłby kolejną daną osobową trzymaną bez potrzeby.
-- Polityka prywatności obiecuje kasowanie tych wierszy po dziewięćdziesięciu dniach
-- i robi to zdarzenie na końcu pliku.

CREATE TABLE auth_events (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     CHAR(36) NULL,
  kind        VARCHAR(32) NOT NULL,
  ip_hash     CHAR(64) NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY auth_events_created_idx (created_at),
  KEY auth_events_ip_idx (ip_hash, created_at),
  CONSTRAINT auth_events_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- ZGODY NA DOKUMENTY
-- =============================================================================
--
-- Osobna tabela, a nie kolumna w users. Kolumna przechowywałaby wyłącznie stan bieżący,
-- czyli odpowiedź na pytanie "czy się zgodził". Przy dokumencie, który się zmienia,
-- potrzebna jest odpowiedź trudniejsza: "na którą wersję i kiedy". Bez historii nie da
-- się jej udzielić, a przy sporze albo przy kontroli to jest pytanie, które padnie.

CREATE TABLE consents (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     CHAR(36) NULL,
  document    VARCHAR(16) NOT NULL,
  version     VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash     CHAR(64) NULL,

  KEY consents_user_idx (user_id, document, accepted_at),
  CONSTRAINT consents_doc_chk CHECK (document IN ('regulamin', 'prywatnosc')),
  -- SET NULL, a nie CASCADE: dowód przyjęcia regulaminu jest potrzebny także po odejściu
  -- użytkownika, a odcięty od osoby nikogo już nie wskazuje.
  CONSTRAINT consents_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- ULUBIONE
-- =============================================================================
--
-- Lista obserwacyjna użytkownika. Klucz złożony z właściciela i odwołania do obiektu,
-- bo ten sam obiekt nie ma prawa wystąpić na liście dwa razy, a osobny identyfikator
-- wiersza niczego by tu nie wnosił.

CREATE TABLE favourites (
  user_id     CHAR(36) NOT NULL,

  -- Odwołanie do obiektu w postaci rodzaj:identyfikator, na przykład planeta:jowisz,
  -- gwiazda:hip91262, messier:m31. Postaci pilnuje wzorzec, bo bez niego do listy
  -- trafiłby prędzej czy później dowolny tekst.
  object_ref  VARCHAR(64) NOT NULL,

  label       VARCHAR(120) NOT NULL,
  kind        VARCHAR(16) NOT NULL,
  note        VARCHAR(500) NULL,
  observed_at DATE NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id, object_ref),
  KEY favourites_recent_idx (user_id, created_at),
  CONSTRAINT favourites_ref_chk CHECK (object_ref REGEXP '^[a-z]+:[a-z0-9_-]+$'),
  CONSTRAINT favourites_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- =============================================================================
-- SPRZĄTANIE
-- =============================================================================
--
-- Obietnica z polityki prywatności bez zadania, które ją wykonuje, jest tylko zdaniem
-- na stronie. To zdarzenie kasuje zapisy o logowaniach po dziewięćdziesięciu dniach
-- i wygasłe sesje.
--
-- Wymaga włączonego planisty. Sprawdź: SHOW VARIABLES LIKE 'event_scheduler';
-- Włączenie: SET GLOBAL event_scheduler = ON;
-- Na hostingu współdzielonym bywa wyłączony i nie da się go włączyć. Wtedy to samo
-- robi skrypt server/php/sprzatanie.php, wołany raz na dobę przez zadanie cron w panelu.

CREATE EVENT IF NOT EXISTS sprzatanie_dobowe
  ON SCHEDULE EVERY 1 DAY
  DO BEGIN
    DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL 90 DAY;
    DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL 7 DAY;
    DELETE FROM tokens WHERE expires_at < NOW() - INTERVAL 7 DAY;
  END;
