<?php
/*
 * Połączenie z bazą i wspólne pomocnicze.
 */

declare(strict_types=1);

function polacz(array $config): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db']['host'],
        $config['db']['name'],
    );

    $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
        /* Wyjątek zamiast cichego false przy błędzie. Bez tego zapytanie, które się nie
         * powiodło, zwraca po prostu nieprawdę, a kod leci dalej z pustymi danymi. */
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        /*
         * Prawdziwe zapytania przygotowane, nie udawane po stronie sterownika.
         * Przy udawanych sterownik sam skleja zapytanie z parametrami, więc cała ochrona
         * przed wstrzyknięciem zależy od poprawności jego cudzysłowów. Przy prawdziwych
         * dane nigdy nie stają się częścią zapytania i wstrzyknięcie jest niemożliwe.
         */
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    /* Wszystkie czasy w UTC. Bez tego serwer i baza mogą mieć różne strefy i wygaśnięcie
     * sesji wypada wtedy o dwie godziny wcześniej albo później, zależnie od pory roku. */
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}

/** Identyfikator w postaci UUID, generowany w PHP, a nie w bazie. */
function uuid(): string
{
    $bajty = random_bytes(16);
    $bajty[6] = chr((ord($bajty[6]) & 0x0f) | 0x40);
    $bajty[8] = chr((ord($bajty[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bajty), 4));
}

/** Skrót adresu IP z solą. Do rozpoznania serii prób z jednego miejsca skrót wystarcza. */
function skrotIp(string $ip, string $sol): string
{
    return hash('sha256', $sol . $ip);
}

function odpowiedz(int $kod, array $dane): never
{
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dane, JSON_UNESCAPED_UNICODE);
    exit;
}

function blad(int $kod, string $rodzaj, string $wiadomosc): never
{
    odpowiedz($kod, ['error' => $rodzaj, 'message' => $wiadomosc]);
}

/** Treść żądania w postaci tablicy. Puste albo niepoprawne kończy się błędem 400. */
function cialoZadania(): array
{
    $surowe = file_get_contents('php://input') ?: '';
    $dane = json_decode($surowe, true);
    if (!is_array($dane)) {
        blad(400, 'zle_dane', 'Treść żądania nie jest poprawnym JSON-em.');
    }
    return $dane;
}
