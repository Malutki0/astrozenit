<?php
/*
 * Sesje.
 *
 * Żeton sesji istnieje jawnie w dwóch miejscach: w ciasteczku przeglądarki i przez chwilę
 * w pamięci serwera. W bazie leży wyłącznie jego skrót. Ktoś, kto zdobędzie odczyt z bazy,
 * nie może się dzięki temu podszyć pod zalogowanego, bo ze skrótu nie odtworzy żetonu.
 * To ta sama zasada co przy hasłach i z tego samego powodu.
 *
 * Ciasteczko ma HttpOnly, więc skrypt na stronie go nie odczyta. Ma to znaczenie, którego
 * łatwo nie docenić: żeton trzymany w localStorage zabiera jeden błąd prowadzący do
 * wstrzyknięcia kodu i wszystkie sesje są przejęte. Ciasteczka HttpOnly to zamyka.
 */

declare(strict_types=1);

const CIASTECZKO = 'zenit_sesja';

function zalozSesje(PDO $pdo, array $config, string $userId): void
{
    $zeton = bin2hex(random_bytes(32));
    $skrot = hash('sha256', $zeton);
    $wygasa = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . $config['sesja_dni'] . ' days');

    $pdo->prepare(
        'INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)',
    )->execute([
        uuid(),
        $userId,
        $skrot,
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
        skrotIp($_SERVER['REMOTE_ADDR'] ?? '', $config['ip_salt']),
        $wygasa->format('Y-m-d H:i:s'),
    ]);

    setcookie(CIASTECZKO, $zeton, [
        'expires' => $wygasa->getTimestamp(),
        'path' => '/',
        /* Wyłącznie po połączeniu szyfrowanym. */
        'secure' => true,
        /* Niedostępne dla skryptów na stronie. */
        'httponly' => true,
        /*
         * Lax, nie None. Przy None ciasteczko idzie także przy żądaniach wywołanych
         * z cudzej strony, co otwiera drogę do działania w imieniu zalogowanego.
         * Lax wystarcza, bo aplikacja i API stoją w tej samej domenie nadrzędnej.
         */
        'samesite' => 'Lax',
    ]);
}

/** Użytkownik bieżącej sesji albo null. Odświeża znacznik ostatniej aktywności. */
function zalogowany(PDO $pdo): ?array
{
    $zeton = $_COOKIE[CIASTECZKO] ?? '';
    if ($zeton === '') {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT u.id, u.email, u.display_name, u.role, u.email_verified_at, s.id AS sesja_id
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()
           AND u.deleted_at IS NULL',
    );
    $stmt->execute([hash('sha256', $zeton)]);
    $wiersz = $stmt->fetch();
    if (!$wiersz) {
        return null;
    }

    $pdo->prepare('UPDATE sessions SET last_seen_at = NOW() WHERE id = ?')
        ->execute([$wiersz['sesja_id']]);

    return $wiersz;
}

function wymagajZalogowania(PDO $pdo): array
{
    $uzytkownik = zalogowany($pdo);
    if ($uzytkownik === null) {
        blad(401, 'brak_sesji', 'Trzeba się zalogować.');
    }
    return $uzytkownik;
}

function zakonczSesje(PDO $pdo): void
{
    $zeton = $_COOKIE[CIASTECZKO] ?? '';
    if ($zeton !== '') {
        $pdo->prepare('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ?')
            ->execute([hash('sha256', $zeton)]);
    }
    setcookie(CIASTECZKO, '', [
        'expires' => 1,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
