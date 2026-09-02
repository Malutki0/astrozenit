# Kontrakt API kont

Sześć punktów końcowych. Klient jest już napisany i czeka w `src/lib/authRemote.ts`,
więc serwer musi tylko odpowiadać w tym kształcie.

Wszystkie odpowiedzi są w formacie JSON. Sesja jest przenoszona ciasteczkiem `zenit_sesja`
z atrybutami `HttpOnly`, `Secure` i `SameSite=Lax`, a nie nagłówkiem, więc klient
wysyła zapytania z `credentials: 'include'` i nigdy nie dotyka tokenu.

## Wspólny kształt błędu

```json
{ "error": "kod-bledu", "message": "Zdanie po polsku, gotowe do pokazania użytkownikowi." }
```

Kody: `dane-niepoprawne`, `konto-istnieje`, `blokada`, `brak-uprawnien`, `token-nieważny`,
`haslo-za-slabe`, `blad-serwera`.

## POST /api/rejestracja

```json
{ "email": "kto@przyklad.pl", "password": "...", "displayName": "Jan" }
```

Wymagania po stronie serwera, sprawdzane niezależnie od tego, co sprawdza przeglądarka:
adres o poprawnej budowie, hasło co najmniej dwunastoznakowe, nazwa od dwóch do sześćdziesięciu
znaków. Serwer liczy skrót Argon2id, tworzy konto z rolą `czytelnik` i wysyła wiadomość
z tokenem potwierdzającym, ważnym dobę.

Odpowiedź `201` z `{ "ok": true }`. **Bez sesji**: konto trzeba najpierw potwierdzić.

Gdy adres jest już zajęty, odpowiedź jest taka sama jak przy powodzeniu, a na podany adres
idzie wiadomość informująca o próbie rejestracji. Inaczej formularz stałby się narzędziem
do sprawdzania, kto ma konto w serwisie.

## POST /api/logowanie

```json
{ "email": "kto@przyklad.pl", "password": "..." }
```

Serwer sprawdza blokadę, liczy skrót, porównuje w stałym czasie. Przy powodzeniu zeruje
licznik prób, tworzy sesję ważną trzydzieści dni i ustawia ciasteczko. Przy niepowodzeniu
zwiększa licznik i wydłuża blokadę.

Odpowiedź `200`:

```json
{
  "user": {
    "id": "uuid",
    "email": "kto@przyklad.pl",
    "displayName": "Jan",
    "role": "redaktor",
    "emailVerified": true
  }
}
```

Przy złym haśle **i** przy nieznanym adresie odpowiedź jest identyczna: `401` z kodem
`dane-niepoprawne`. Przy nieznanym adresie serwer i tak liczy skrót na wartości zastępczej,
żeby czas odpowiedzi nie zdradzał istnienia konta.

## POST /api/wylogowanie

Bez treści. Unieważnia bieżącą sesję i kasuje ciasteczko. Odpowiedź `204`.

## GET /api/ja

Zwraca dane zalogowanego użytkownika w tym samym kształcie co logowanie albo `401`,
gdy sesji nie ma. Klient woła to raz przy starcie, żeby odtworzyć stan po odświeżeniu strony.

Przy okazji odświeża `last_seen_at` w sesji.

## POST /api/haslo/reset

```json
{ "email": "kto@przyklad.pl" }
```

Zawsze `204`, niezależnie od tego, czy konto istnieje. Gdy istnieje, na adres idzie token
ważny godzinę.

## POST /api/haslo/zmiana

Dwa przypadki w jednym punkcie:

```json
{ "token": "...", "password": "..." }
```

albo, dla zalogowanego:

```json
{ "currentPassword": "...", "password": "..." }
```

Po zmianie hasła serwer unieważnia **wszystkie** sesje tego konta poza bieżącą.
To jedyny moment, w którym użytkownik może odciąć kogoś, kto przejął jego hasło,
więc nie wolno tego pominąć.

## Nagłówki wspólne dla wszystkich odpowiedzi

```
Access-Control-Allow-Origin: https://twojadomena.pl
Access-Control-Allow-Credentials: true
Cache-Control: no-store
```

Adres w pierwszym nagłówku musi być konkretny. Gwiazdka jest niedozwolona razem
z przesyłaniem ciasteczek i przeglądarka i tak takie zapytanie odrzuci.


## Ulubione

Lista obserwacyjna zalogowanego użytkownika. Wszystkie ścieżki wymagają ważnej sesji
i odpowiadają kodem 401, gdy jej nie ma.

### `GET /api/ulubione`

Zwraca całą listę, od ostatnio dodanych.

```json
{
  "pozycje": [
    {
      "ref": "dso:M31",
      "label": "Galaktyka Andromedy",
      "note": "Widoczna gołym okiem spod miasta, sprawdzić lornetką 10x50",
      "observedAt": null,
      "createdAt": "2026-09-01T21:40:00Z"
    }
  ]
}
```

### `PUT /api/ulubione/{ref}`

Dodaje pozycję albo aktualizuje istniejącą. Wybór metody PUT zamiast POST jest tu
celowy: operacja jest idempotentna, bo klucz główny to para użytkownik i obiekt,
więc powtórzone żądanie daje ten sam wynik i nie tworzy duplikatu. Klient może je
bezpiecznie ponowić po zerwaniu połączenia, nie sprawdzając wcześniej, czy pierwsze
doszło.

```json
{ "label": "Galaktyka Andromedy", "note": null, "observed": false }
```

Odpowiada kodem 200 razem z zapisaną pozycją.

### `DELETE /api/ulubione/{ref}`

Usuwa pozycję. Odpowiada kodem 204 także wtedy, gdy pozycji nie było, z tego samego
powodu co wyżej: żądanie ma być bezpieczne do ponowienia.

### Ograniczenia

Lista jednego użytkownika nie może przekroczyć pięciuset pozycji. Nie jest to
ograniczenie techniczne, tylko zabezpieczenie przed użyciem konta jako darmowego
magazynu danych. Po przekroczeniu limitu serwer odpowiada kodem 409 i komunikatem
mówiącym wprost, ile pozycji jest i ile wolno.

## Zgody na dokumenty

### `GET /api/zgody`

Zwraca ostatnio przyjętą wersję każdego dokumentu:

```json
{ "regulamin": { "version": "1.0", "acceptedAt": "2026-09-02T18:00:00Z" },
  "prywatnosc": { "version": "1.0", "acceptedAt": "2026-09-02T18:00:00Z" } }
```

Brak wpisu oznacza, że dokument nie został jeszcze przyjęty w żadnej wersji.

### `POST /api/zgody`

```json
{ "document": "regulamin", "version": "1.0" }
```

Dopisuje wiersz, nie nadpisuje poprzedniego. Serwer sam wstawia czas i skrót adresu,
i nie przyjmuje ich od klienta: wartości podane przez przeglądarkę byłyby dowodem
napisanym przez stronę, której ten dowód dotyczy.

Wersję serwer sprawdza z własną listą obowiązujących. Zgoda na wersję, której nigdy nie
było, jest odrzucana kodem `422`.

## Usunięcie konta

### `DELETE /api/konto`

```json
{ "password": "..." }
```

Wymaga podania hasła, mimo trwającej sesji. Operacja jest nieodwracalna, a przejęta sesja
nie może wystarczyć do skasowania cudzych danych.

Serwer wywołuje `delete_user_account(id)`. Znikają: konto, sesje, ulubione i notatki.
Zostają: wpisy w aktualnościach, pozbawione autora, bo są treścią serwisu, oraz zgody
w postaci odciętej od osoby, bo dowód przyjęcia regulaminu jest potrzebny także po
odejściu użytkownika, a sam z siebie nikogo już nie wskazuje.

Odpowiedź `204` i wygaszenie ciasteczka sesji. Bez okresu przejściowego i bez pytania
o powód: prawo do usunięcia danych jest bezwarunkowe.

### `GET /api/konto/eksport`

Zwraca wszystko, co serwis trzyma o użytkowniku, jako jeden plik JSON: dane konta,
ulubione z notatkami i historię zgód. Służy prawu do przenoszenia danych. Bez parametrów,
bo częściowy eksport tego prawa nie realizuje.
