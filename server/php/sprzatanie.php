<?php
/*
 * Kasowanie danych, których nie wolno już trzymać.
 *
 * Polityka prywatności obiecuje usuwanie zapisów o logowaniach po dziewięćdziesięciu
 * dniach. Obietnica bez zadania, które ją wykonuje, jest tylko zdaniem na stronie.
 *
 * Schemat bazy zawiera zdarzenie robiące to samo, ale na hostingu współdzielonym planista
 * zdarzeń bywa wyłączony i nie da się go włączyć. Ten skrypt jest wtedy jedyną drogą.
 * Wołany raz na dobę zadaniem cron z panelu hostingu:
 *
 *   php /sciezka/do/server/php/sprzatanie.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Ten skrypt uruchamia się wyłącznie z wiersza poleceń.');
}

$config = require __DIR__ . '/config.php';
require __DIR__ . '/db.php';

$pdo = polacz($config);

$zdarzenia = $pdo->exec('DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL 90 DAY');
$sesje = $pdo->exec('DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL 7 DAY');
$zetony = $pdo->exec('DELETE FROM tokens WHERE expires_at < NOW() - INTERVAL 7 DAY');

echo "Usunięto: zdarzeń $zdarzenia, sesji $sesje, żetonów $zetony\n";
