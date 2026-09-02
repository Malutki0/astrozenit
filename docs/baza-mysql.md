# Baza MySQL i zaplecze kont

Instrukcja od pustego hostingu do działających kont. Uzupełnia `docs/wdrozenie.md`,
który opisuje samą stronę.

## Rzecz, którą trzeba zrozumieć na początku

**Strona statyczna nie umie rozmawiać z MySQL-em.** MySQL nie ma interfejsu HTTP: rozmawia
własnym protokołem na porcie 3306, a przeglądarka takiego połączenia nie nawiąże i nie
powinna. Gdyby nawiązała, hasło do bazy musiałoby leżeć w kodzie strony, czyli byłoby
dostępne dla każdego, kto naciśnie „pokaż źródło".

Między przeglądarką a bazą musi więc stać serwer. To on zna hasło do bazy, on sprawdza,
kto pyta, i on decyduje, co odesłać. Bez tego elementu sama baza jest bezużyteczna.

```
przeglądarka  ->  API (PHP)  ->  MySQL
   HTTPS          port 3306
```

## Dwie drogi i uczciwe porównanie

| | MySQL z własnym API | Supabase |
| --- | --- | --- |
| Co trzeba napisać | nic, jest w `server/php` | nic |
| Co trzeba postawić | hosting z PHP i MySQL | projekt w Supabase |
| Rejestracja i logowanie | gotowe w `server/php/index.php` | gotowe u dostawcy |
| Wysyłka poczty | trzeba podpiąć samemu | w cenie |
| Koszt | cena hostingu | plan bezpłatny do 500 MB |
| Baza | MySQL, phpMyAdmin | PostgreSQL |

Supabase jest mniejszym nakładem, bo potwierdzanie adresu i odzyskiwanie hasła są tam
zrobione i utrzymywane przez kogoś innego. MySQL wybiera się wtedy, gdy hosting i tak
jest wykupiony albo gdy zależy na trzymaniu wszystkiego u siebie.

Poniżej droga z MySQL-em, bo o nią pytałeś.

## Krok 1: hosting z PHP i MySQL

Potrzebny jest hosting współdzielony z PHP w wersji **8.1 lub nowszej** i MySQL **8.0
lub nowszym**. Wersje mają znaczenie:

- PHP poniżej 8.1 nie zna składni użytej w `server/php` i skrypt się nie uruchomi,
- MySQL poniżej 8.0.16 po cichu ignoruje ograniczenia CHECK, więc do bazy wejdą dane,
  które schemat miał odrzucić. Kod serwera pilnuje tego samego, więc nie jest to awaria,
  ale warto wiedzieć.

Sprawdzenie wersji po zalogowaniu do panelu: PHP w zakładce konfiguracji, MySQL
poleceniem `SELECT VERSION();` w phpMyAdminie.

## Krok 2: baza

W panelu hostingu utwórz bazę i użytkownika. Zanotuj cztery rzeczy: adres serwera bazy,
nazwę bazy, nazwę użytkownika i hasło.

Potem w phpMyAdminie zakładka **Import**, plik `server/schema-mysql.sql`, wykonaj.
Powstanie sześć tabel: `users`, `sessions`, `tokens`, `auth_events`, `consents`,
`favourites`.

Sprawdzenie, czy się udało:

```sql
SHOW TABLES;
SELECT VERSION();
```

## Krok 3: wgranie zaplecza

Zawartość katalogu `server/php` wgraj na serwer do podkatalogu `api` w katalogu
publicznym, tak żeby adres `https://astrozenit.pl/api/ja` trafiał do `index.php`.

Plik `.htaccess` jedzie razem z resztą i jest konieczny: bez niego serwer szukałby pliku
`rejestracja.php` dla adresu `/api/rejestracja` i zwracał błąd 404.

## Krok 4: ustawienia

Zaplecze czyta ustawienia ze zmiennych środowiskowych. Jeżeli hosting pozwala je ustawić,
zrób to w panelu. Jeżeli nie pozwala, a hostingi współdzielone zwykle nie pozwalają,
utwórz obok `config.php` plik `config.local.php`:

```php
<?php
putenv('ZENIT_DB_HOST=localhost');
putenv('ZENIT_DB_NAME=nazwa_bazy');
putenv('ZENIT_DB_USER=uzytkownik');
putenv('ZENIT_DB_PASS=haslo');
putenv('ZENIT_ORIGIN=https://astrozenit.pl');
putenv('ZENIT_IP_SALT=wklej_tu_losowy_ciag_64_znakow');
```

Sól do skrótów adresów wygeneruj i nigdy nie zmieniaj, bo zmiana rozspójni istniejące
zapisy:

```bash
openssl rand -hex 32
```

Ten plik **nie może trafić do repozytorium**. Jest wpisany do `.gitignore`, a `.htaccess`
dodatkowo zabrania serwerowi go odesłać, gdyby przestał wykonywać PHP.

## Krok 5: podpięcie strony

W konfiguracji hostingu strony, czyli w Netlify albo w Vercelu, dodaj zmienną:

```
VITE_API_URL=https://astrozenit.pl/api
```

Przebuduj stronę. Od tej chwili rejestracja i logowanie idą na serwer, konta są wspólne
dla wszystkich urządzeń, a zdanie o koncie zapisanym w przeglądarce znika samo, bo
przestaje być prawdziwe.

Nic więcej w kodzie zmieniać nie trzeba: obie wersje spełniają ten sam interfejs
`AuthProvider` w `src/lib/auth.ts`.

## Krok 6: sprzątanie

Polityka prywatności obiecuje kasowanie zapisów o logowaniach po dziewięćdziesięciu dniach.
Schemat zawiera zdarzenie, które to robi, ale na hostingu współdzielonym planista zdarzeń
bywa wyłączony. Sprawdź:

```sql
SHOW VARIABLES LIKE 'event_scheduler';
```

Jeżeli jest wyłączony, dodaj w panelu zadanie cron uruchamiane raz na dobę:

```bash
php /sciezka/do/api/sprzatanie.php
```

## Czego tu nie ma

**Wysyłki poczty.** Potwierdzenie adresu i odzyskiwanie hasła generują żeton i zapisują go
w tabeli `tokens`, ale nikt tego żetonu nie wysyła. Trzeba podpiąć wysyłkę: funkcję `mail`
z PHP, jeżeli hosting ją ma i jeżeli wiadomości nie lądują w spamie, albo usługę taką jak
Resend czy Postmark. Miejsca są oznaczone komentarzem w `server/php/index.php`.

Dopóki wysyłki nie ma, konto da się założyć i zalogować, ale nie da się odzyskać
zapomnianego hasła. Przy zapraszaniu pierwszych użytkowników to wystarcza, przy otwarciu
dla wszystkich już nie.

## Co sprawdzić po wdrożeniu

```bash
curl https://astrozenit.pl/api/ja
```

Powinno wrócić `{"user":null}`. Odpowiedź 404 znaczy, że nie działa `.htaccess`.
Odpowiedź 500 znaczy, że nie działa połączenie z bazą, i wtedy zajrzyj do dziennika
błędów PHP w panelu hostingu.

Potem w przeglądarce: załóż konto, wyloguj się, zaloguj ponownie, dodaj coś do ulubionych
i sprawdź w phpMyAdminie, czy wiersz naprawdę pojawił się w tabeli `favourites`.
