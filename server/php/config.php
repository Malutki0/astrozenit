<?php
/*
 * Ustawienia zaplecza.
 *
 * Wartości wrażliwe czytamy ze zmiennych środowiskowych, a nie wpisujemy do pliku.
 * Plik z hasłem do bazy prędzej czy później trafi do repozytorium, a stamtąd nie da
 * się go już wycofać: historia zostaje. Na hostingu współdzielonym, gdzie zmiennych
 * ustawić się nie da, jest plik config.local.php, wpisany do .gitignore.
 */

declare(strict_types=1);

$lokalny = __DIR__ . '/config.local.php';
if (is_file($lokalny)) {
    require $lokalny;
}

function ustawienie(string $nazwa, ?string $domyslne = null): string
{
    $wartosc = getenv($nazwa);
    if ($wartosc === false || $wartosc === '') {
        if ($domyslne === null) {
            http_response_code(500);
            exit(json_encode(['error' => 'konfiguracja', 'message' => "Brak ustawienia $nazwa."]));
        }
        return $domyslne;
    }
    return $wartosc;
}

return [
    'db' => [
        'host' => ustawienie('ZENIT_DB_HOST', 'localhost'),
        'name' => ustawienie('ZENIT_DB_NAME'),
        'user' => ustawienie('ZENIT_DB_USER'),
        'pass' => ustawienie('ZENIT_DB_PASS'),
    ],

    /*
     * Adres strony, z której wolno wołać to API.
     *
     * Przeglądarka pyta serwer o zgodę, zanim wyśle żądanie z ciasteczkiem sesji
     * na inną domenę. Gwiazdka w tym miejscu byłaby błędem: przy żądaniach z danymi
     * uwierzytelniającymi przeglądarka i tak jej nie przyjmie, a gdyby przyjęła,
     * dowolna strona w sieci mogłaby działać w imieniu zalogowanego użytkownika.
     */
    'origin' => ustawienie('ZENIT_ORIGIN', 'https://astrozenit.pl'),

    /* Sól do skrótów adresów IP. Bez niej skrót adresu da się odwrócić, bo adresów
     * IPv4 jest tylko cztery miliardy i przeliczenie ich wszystkich trwa chwilę. */
    'ip_salt' => ustawienie('ZENIT_IP_SALT'),

    'sesja_dni' => 30,
];
