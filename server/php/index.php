<?php
/*
 * Punkt wejścia zaplecza AstroZenitu.
 *
 * Jeden plik obsługujący wszystkie ścieżki, bo tak jest najprościej wystawić to na
 * hostingu współdzielonym: wystarczy przekierować cały ruch tutaj przez .htaccess.
 * Przy sześciu punktach końcowych rozbijanie tego na strukturę katalogów i router
 * z biblioteki byłoby narzutem bez pokrycia.
 *
 * Kontrakt opisuje server/api.md i to on jest źródłem prawdy. Ten plik go wykonuje.
 */

declare(strict_types=1);

$config = require __DIR__ . '/config.php';
require __DIR__ . '/db.php';
require __DIR__ . '/sesja.php';

/* ------------------------------------------------------- zgoda na wywołania z domeny */

/*
 * Przeglądarka pyta o zgodę, zanim wyśle żądanie z ciasteczkiem na inną domenę.
 * Odpowiadamy konkretnym adresem, nigdy gwiazdką: przy żądaniach z danymi
 * uwierzytelniającymi przeglądarka gwiazdki i tak nie przyjmie, a gdyby przyjęła,
 * dowolna strona w sieci mogłaby działać w imieniu zalogowanego użytkownika.
 */
$zrodlo = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($zrodlo === $config['origin']) {
    header('Access-Control-Allow-Origin: ' . $config['origin']);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$pdo = polacz($config);
$sciezka = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$sciezka = '/' . trim(str_replace('/api', '', $sciezka), '/');
$metoda = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ip = skrotIp($_SERVER['REMOTE_ADDR'] ?? '', $config['ip_salt']);

function zapiszZdarzenie(PDO $pdo, ?string $userId, string $rodzaj, string $ip): void
{
    $pdo->prepare('INSERT INTO auth_events (user_id, kind, ip_hash, user_agent) VALUES (?, ?, ?, ?)')
        ->execute([$userId, $rodzaj, $ip, substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255)]);
}

/* ---------------------------------------------------------------------- rejestracja */

if ($sciezka === '/rejestracja' && $metoda === 'POST') {
    $dane = cialoZadania();
    $email = trim((string) ($dane['email'] ?? ''));
    $haslo = (string) ($dane['password'] ?? '');
    $nazwa = trim((string) ($dane['displayName'] ?? ''));

    /*
     * Sprawdzamy wszystko po swojej stronie, niezależnie od tego, co sprawdziła
     * przeglądarka. Kontrola w przeglądarce jest wygodą dla użytkownika, nie
     * zabezpieczeniem: żądanie da się wysłać z pominięciem całego interfejsu.
     */
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        blad(422, 'zly_adres', 'Adres poczty jest niepoprawny.');
    }
    if (mb_strlen($haslo) < 12) {
        blad(422, 'slabe_haslo', 'Hasło musi mieć co najmniej dwanaście znaków.');
    }
    if (mb_strlen($nazwa) < 2 || mb_strlen($nazwa) > 60) {
        blad(422, 'zla_nazwa', 'Nazwa musi mieć od dwóch do sześćdziesięciu znaków.');
    }

    $znormalizowany = mb_strtolower($email);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email_normalized = ?');
    $stmt->execute([$znormalizowany]);
    $istnieje = (bool) $stmt->fetch();

    if (!$istnieje) {
        $id = uuid();
        $pdo->prepare(
            'INSERT INTO users (id, email, email_normalized, display_name, password_hash)
             VALUES (?, ?, ?, ?, ?)',
        )->execute([
            $id,
            $email,
            $znormalizowany,
            $nazwa,
            /*
             * Argon2id z parametrami mocniejszymi od domyślnych. Nigdy zwykły skrót:
             * sha256 i podobne są zaprojektowane, żeby liczyć się szybko, a przy hasłach
             * chodzi o dokładną odwrotność. Karta graficzna liczy miliardy skrótów sha256
             * na sekundę i tysiące skrótów argon2id, i na tym polega cała różnica.
             */
            password_hash($haslo, PASSWORD_ARGON2ID, [
                'memory_cost' => 65536,
                'time_cost' => 3,
                'threads' => 4,
            ]),
        ]);
        zapiszZdarzenie($pdo, $id, 'rejestracja', $ip);
        /* Tu wysyła się wiadomość z żetonem potwierdzającym, patrz server/api.md. */
    } else {
        zapiszZdarzenie($pdo, null, 'rejestracja_zajety_adres', $ip);
    }

    /*
     * Odpowiedź jest taka sama niezależnie od tego, czy adres był wolny.
     * Inaczej formularz stałby się narzędziem do sprawdzania, kto ma konto w serwisie,
     * a to jest informacja, której nie mamy prawa udostępniać.
     */
    odpowiedz(201, ['ok' => true]);
}

/* ------------------------------------------------------------------------ logowanie */

if ($sciezka === '/logowanie' && $metoda === 'POST') {
    $dane = cialoZadania();
    $email = mb_strtolower(trim((string) ($dane['email'] ?? '')));
    $haslo = (string) ($dane['password'] ?? '');

    $stmt = $pdo->prepare(
        'SELECT id, password_hash, failed_attempts, locked_until
         FROM users WHERE email_normalized = ? AND deleted_at IS NULL',
    );
    $stmt->execute([$email]);
    $uzytkownik = $stmt->fetch();

    if ($uzytkownik && $uzytkownik['locked_until'] !== null
        && new DateTimeImmutable($uzytkownik['locked_until']) > new DateTimeImmutable()) {
        zapiszZdarzenie($pdo, $uzytkownik['id'], 'logowanie_zablokowane', $ip);
        blad(429, 'blokada', 'Zbyt wiele nieudanych prób. Spróbuj później.');
    }

    /*
     * Skrót liczymy także wtedy, gdy konta nie ma, na wartości zastępczej.
     * Bez tego odpowiedź przy nieistniejącym adresie wracałaby natychmiast, a przy
     * istniejącym po kilkuset milisekundach potrzebnych na argon2id. Różnica jest
     * mierzalna i wystarczyłaby do sprawdzenia, kto ma tu konto, bez znajomości hasła.
     */
    $skrot = $uzytkownik['password_hash']
        ?? '$argon2id$v=19$m=65536,t=3,p=4$YXN0cm96ZW5pdGR1bW15$0000000000000000000000000000000000000000000';
    $pasuje = password_verify($haslo, $skrot);

    if (!$uzytkownik || !$pasuje) {
        if ($uzytkownik) {
            $proby = (int) $uzytkownik['failed_attempts'] + 1;
            /* Blokada rośnie wykładniczo od piątej próby, najwyżej do godziny. */
            $blokada = $proby >= 5
                ? (new DateTimeImmutable())->modify('+' . min(3600, 2 ** ($proby - 4)) . ' seconds')
                : null;
            $pdo->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
                ->execute([$proby, $blokada?->format('Y-m-d H:i:s'), $uzytkownik['id']]);
        }
        zapiszZdarzenie($pdo, $uzytkownik['id'] ?? null, 'logowanie_nieudane', $ip);
        blad(401, 'dane', 'Nieprawidłowy adres albo hasło.');
    }

    /* Skrót policzony starszymi parametrami przeliczamy przy okazji udanego logowania.
     * To jedyna chwila, w której znamy hasło jawnie i możemy to zrobić. */
    if (password_needs_rehash($skrot, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 4])) {
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($haslo, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 4]), $uzytkownik['id']]);
    }

    $pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?')
        ->execute([$uzytkownik['id']]);
    zalozSesje($pdo, $config, $uzytkownik['id']);
    zapiszZdarzenie($pdo, $uzytkownik['id'], 'logowanie', $ip);

    $stmt = $pdo->prepare('SELECT id, email, display_name, role FROM users WHERE id = ?');
    $stmt->execute([$uzytkownik['id']]);
    odpowiedz(200, ['ok' => true, 'user' => $stmt->fetch()]);
}

/* ----------------------------------------------------------------------- wylogowanie */

if ($sciezka === '/wylogowanie' && $metoda === 'POST') {
    zakonczSesje($pdo);
    odpowiedz(204, []);
}

/* ------------------------------------------------------------------------------- ja */

if ($sciezka === '/ja' && $metoda === 'GET') {
    $uzytkownik = zalogowany($pdo);
    if ($uzytkownik === null) {
        odpowiedz(200, ['user' => null]);
    }
    odpowiedz(200, ['user' => [
        'id' => $uzytkownik['id'],
        'email' => $uzytkownik['email'],
        'displayName' => $uzytkownik['display_name'],
        'role' => $uzytkownik['role'],
        'emailVerified' => $uzytkownik['email_verified_at'] !== null,
    ]]);
}

/* ---------------------------------------------------------------------- zmiana hasła */

if ($sciezka === '/haslo/zmiana' && $metoda === 'POST') {
    $uzytkownik = wymagajZalogowania($pdo);
    $dane = cialoZadania();
    $obecne = (string) ($dane['currentPassword'] ?? '');
    $nowe = (string) ($dane['nextPassword'] ?? '');

    if (mb_strlen($nowe) < 12) {
        blad(422, 'slabe_haslo', 'Nowe hasło musi mieć co najmniej dwanaście znaków.');
    }

    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$uzytkownik['id']]);
    if (!password_verify($obecne, (string) $stmt->fetchColumn())) {
        zapiszZdarzenie($pdo, $uzytkownik['id'], 'zmiana_hasla_nieudana', $ip);
        blad(401, 'dane', 'Obecne hasło jest nieprawidłowe.');
    }

    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([
        password_hash($nowe, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 4]),
        $uzytkownik['id'],
    ]);

    /*
     * Zmiana hasła unieważnia wszystkie sesje poza bieżącą. Jeżeli ktoś zmienia hasło,
     * bo podejrzewa, że ktoś inny się do konta dostał, pozostawienie tamtej sesji czynnej
     * czyniłoby całą operację bezcelową.
     */
    $zeton = $_COOKIE[CIASTECZKO] ?? '';
    $pdo->prepare('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND token_hash <> ?')
        ->execute([$uzytkownik['id'], hash('sha256', $zeton)]);

    zapiszZdarzenie($pdo, $uzytkownik['id'], 'zmiana_hasla', $ip);
    odpowiedz(200, ['ok' => true]);
}

/* ------------------------------------------------------------------ odzyskanie hasła */

if ($sciezka === '/haslo/reset' && $metoda === 'POST') {
    $dane = cialoZadania();
    $email = mb_strtolower(trim((string) ($dane['email'] ?? '')));

    $stmt = $pdo->prepare('SELECT id FROM users WHERE email_normalized = ? AND deleted_at IS NULL');
    $stmt->execute([$email]);
    $id = $stmt->fetchColumn();

    if ($id) {
        $zeton = bin2hex(random_bytes(32));
        $pdo->prepare(
            'INSERT INTO tokens (id, user_id, purpose, token_hash, expires_at)
             VALUES (?, ?, ?, ?, NOW() + INTERVAL 1 HOUR)',
        )->execute([uuid(), $id, 'reset', hash('sha256', $zeton)]);
        zapiszZdarzenie($pdo, (string) $id, 'reset_hasla_zamowiony', $ip);
        /* Tu wysyła się wiadomość z odnośnikiem zawierającym $zeton. Sam żeton nie trafia
         * do bazy jawnie i nie wraca w odpowiedzi: jedyną drogą do niego jest poczta. */
    }

    /*
     * Odpowiedź jest taka sama niezależnie od tego, czy konto istnieje. Inaczej ten
     * punkt stałby się narzędziem do sprawdzania, kto ma konto w serwisie.
     */
    odpowiedz(200, ['ok' => true]);
}

/* -------------------------------------------------------------------------- ulubione */

if ($sciezka === '/ulubione' && $metoda === 'GET') {
    $uzytkownik = wymagajZalogowania($pdo);
    $stmt = $pdo->prepare(
        'SELECT object_ref AS ref, label, kind, note, observed_at AS observedAt, created_at AS createdAt
         FROM favourites WHERE user_id = ? ORDER BY created_at DESC LIMIT 500',
    );
    $stmt->execute([$uzytkownik['id']]);
    odpowiedz(200, ['items' => $stmt->fetchAll()]);
}

if (preg_match('#^/ulubione/(.+)$#', $sciezka, $dopasowanie) && $metoda === 'PUT') {
    $uzytkownik = wymagajZalogowania($pdo);
    $ref = urldecode($dopasowanie[1]);
    if (!preg_match('/^[a-z]+:[a-z0-9_-]+$/', $ref)) {
        blad(422, 'zle_odwolanie', 'Odwołanie do obiektu ma niepoprawną postać.');
    }
    $dane = cialoZadania();

    /*
     * PUT, a nie POST, i to jest wybór, nie przypadek. Dodanie obiektu do listy jest
     * bezpieczne przy powtórzeniu: dwa razy wysłane żądanie ma dać ten sam skutek co
     * jedno. Przy zawodnym połączeniu, a takie jest w terenie w nocy, ponowienie żądania
     * musi być bezpieczne, bo inaczej ta sama gwiazda ląduje na liście dwa razy.
     */
    $pdo->prepare(
        'INSERT INTO favourites (user_id, object_ref, label, kind, note, observed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), kind = VALUES(kind),
                                 note = VALUES(note), observed_at = VALUES(observed_at)',
    )->execute([
        $uzytkownik['id'],
        $ref,
        mb_substr((string) ($dane['label'] ?? $ref), 0, 120),
        mb_substr((string) ($dane['kind'] ?? 'inne'), 0, 16),
        isset($dane['note']) ? mb_substr((string) $dane['note'], 0, 500) : null,
        $dane['observedAt'] ?? null,
    ]);
    odpowiedz(200, ['ok' => true]);
}

if (preg_match('#^/ulubione/(.+)$#', $sciezka, $dopasowanie) && $metoda === 'DELETE') {
    $uzytkownik = wymagajZalogowania($pdo);
    $pdo->prepare('DELETE FROM favourites WHERE user_id = ? AND object_ref = ?')
        ->execute([$uzytkownik['id'], urldecode($dopasowanie[1])]);
    odpowiedz(204, []);
}

/* ----------------------------------------------------------------------------- zgody */

if ($sciezka === '/zgody' && $metoda === 'POST') {
    $uzytkownik = wymagajZalogowania($pdo);
    $dane = cialoZadania();
    $dokument = (string) ($dane['document'] ?? '');
    if (!in_array($dokument, ['regulamin', 'prywatnosc'], true)) {
        blad(422, 'zly_dokument', 'Nieznany dokument.');
    }
    /* Czas i adres wstawia serwer, nie przyjmujemy ich od klienta: byłby to dowód
     * napisany przez stronę, której ten dowód dotyczy. */
    $pdo->prepare('INSERT INTO consents (user_id, document, version, ip_hash) VALUES (?, ?, ?, ?)')
        ->execute([$uzytkownik['id'], $dokument, mb_substr((string) ($dane['version'] ?? '1.0'), 0, 20), $ip]);
    odpowiedz(201, ['ok' => true]);
}

/* ------------------------------------------------------------------- usunięcie konta */

if ($sciezka === '/konto' && $metoda === 'DELETE') {
    $uzytkownik = wymagajZalogowania($pdo);
    $dane = cialoZadania();

    /* Hasło mimo trwającej sesji. Operacja jest nieodwracalna, a przejęta sesja
     * nie może wystarczyć do skasowania cudzych danych. */
    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$uzytkownik['id']]);
    if (!password_verify((string) ($dane['password'] ?? ''), (string) $stmt->fetchColumn())) {
        blad(401, 'dane', 'Nieprawidłowe hasło.');
    }

    /* Zgody odcinamy od osoby zamiast kasować: dowód przyjęcia regulaminu jest potrzebny
     * także po odejściu użytkownika, a odcięty nikogo już nie wskazuje. Reszta znika
     * kaskadą zapisaną w schemacie. */
    $pdo->prepare('UPDATE consents SET user_id = NULL, ip_hash = NULL WHERE user_id = ?')
        ->execute([$uzytkownik['id']]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$uzytkownik['id']]);
    zakonczSesje($pdo);
    odpowiedz(204, []);
}

blad(404, 'nieznana_sciezka', 'Nie ma takiego punktu końcowego.');
