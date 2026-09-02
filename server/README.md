# Zaplecze kont dla AstroZenitu

Ten katalog nie jest działającym serwerem. Jest opisem zaplecza, które trzeba postawić,
żeby logowanie w AstroZenicie przestało być osłoną interfejsu, a stało się realną kontrolą dostępu.

Projekt prowadzi dwójka studentów Politechniki Poznańskiej, więc zaplecze ma być takie,
żeby dało się je utrzymać po godzinach: bez własnej serwerowni, bez ręcznych operacji
przy każdym wdrożeniu i bez rzeczy, które trzeba pilnować codziennie.

Trzeba to powiedzieć wprost, bo różnica jest zasadnicza. Dziś hasło jest sprawdzane
w przeglądarce użytkownika. Osoba znająca narzędzia deweloperskie obejdzie to w kilka minut,
bo cały mechanizm działa na jej urządzeniu i pod jej kontrolą. Nie da się tego naprawić
lepszym kodem po stronie przeglądarki. Jedynym rozwiązaniem jest serwer, który po prostu
nie odda danych komuś, kto się nie uwierzytelnił.

## Co jest gotowe

| Element | Stan |
| --- | --- |
| Schemat bazy | `schema.sql`, gotowy do uruchomienia |
| Kontrakt API | `api.md`, opisany co do pola |
| Punkt wpięcia w aplikacji | `src/lib/auth.ts`, interfejs `AuthProvider` |
| Implementacja zdalna | `src/lib/authRemote.ts`, gotowa, czeka na adres serwera |

Po postawieniu serwera zmiana w aplikacji sprowadza się do jednej linii w `src/lib/auth.ts`:

```ts
export const authProvider: AuthProvider = new RemoteAuthProvider('https://api.twojadomena.pl');
```

## Wymagania, których nie wolno pominąć

**Skrót hasła.** Argon2id z parametrami co najmniej 64 MB pamięci, 3 przebiegi, 4 wątki,
albo bcrypt z kosztem 12. Nigdy SHA-256 ani nic z rodziny skrótów ogólnego przeznaczenia:
są zaprojektowane, żeby liczyć się szybko, a przy hasłach chodzi o odwrotność.

**Sesja w ciasteczku, nie w pamięci lokalnej.** Ciasteczko z atrybutami `HttpOnly`,
`Secure` i `SameSite=Lax`. Token trzymany w `localStorage` jest odczytywalny przez
dowolny skrypt na stronie, więc jeden błąd prowadzący do wstrzyknięcia kodu oznacza
przejęcie wszystkich sesji. Ciasteczko `HttpOnly` jest niedostępne dla skryptów.

**Ograniczenie tempa prób.** Po stronie serwera, liczone dwutorowo: na konto i na adres
sieciowy. Licznik wyłącznie na konto nie zatrzymuje sprawdzania jednego popularnego hasła
na tysiącu kont, bo każde konto dostaje wtedy tylko jedną próbę.

**Ta sama odpowiedź przy złym haśle i przy nieistniejącym koncie.** Inaczej formularz
logowania staje się narzędziem do sprawdzania, kto ma konto w serwisie. Dotyczy to także
czasu odpowiedzi: przy nieznanym adresie i tak trzeba policzyć skrót, żeby czas był podobny.

**Potwierdzenie adresu przed prawem do pisania.** Konto niepotwierdzone może się zalogować,
ale nie może dodawać wpisów. Bez tego panel redakcyjny stoi otworem dla każdego,
kto wpisze dowolny adres.

## Co tu leży

| Plik | Do czego |
| --- | --- |
| `schema.sql` | schemat bazy, składnia PostgreSQL |
| `schema-mysql.sql` | ten sam schemat dla MySQL 8 |
| `api.md` | kontrakt punktów końcowych, źródło prawdy |
| `php/` | działające zaplecze w PHP, wykonuje kontrakt z `api.md` |

Zaplecze w `php/` obsługuje rejestrację, logowanie, wylogowanie, sprawdzenie sesji,
zmianę hasła, odzyskiwanie hasła, ulubione, zgody i usunięcie konta. Nie obsługuje
wysyłki poczty: żetony powstają i lądują w bazie, ale nikt ich nie wysyła. Miejsca
do podpięcia wysyłki są oznaczone komentarzem.

## Instrukcja wdrożenia

Stronę opisuje `docs/wdrozenie.md`. Bazę MySQL i zaplecze kont opisuje
`docs/baza-mysql.md`. Ten plik zostaje jako opis wymagań i obowiązków, tamte mówią,
co po kolei kliknąć.

## Gdzie to postawić

Aplikacja jest stroną statyczną, więc zaplecze może stać gdziekolwiek. Trzy sensowne drogi,
od najmniejszego nakładu:

1. **Supabase albo podobna usługa z gotowym uwierzytelnianiem.** Schemat z `schema.sql`
   wchodzi tam prawie bez zmian, a rejestracja, logowanie i odzyskiwanie hasła są już
   zrobione i przetestowane. Najszybsza droga i przy tej skali wystarczająca.
2. **Funkcje bezserwerowe** na tym samym hostingu co strona. Kontrakt z `api.md` to sześć
   punktów końcowych, każdy na kilkadziesiąt linii.
3. **Własny serwer**, na przykład Node z Fastify i PostgreSQL. Najwięcej pracy i najwięcej
   kontroli, w tym nad tym, gdzie fizycznie leżą dane.

## Obowiązki, które przychodzą razem z kontami

Uruchomienie kont oznacza przetwarzanie danych osobowych, a to niesie obowiązki niezależne
od tego, czy projekt jest studencki, czy komercyjny. Trzy rzeczy trzeba mieć przed
wpuszczeniem pierwszego użytkownika:

1. **Polityka prywatności** wskazująca, kto jest administratorem danych, jakie dane są
   zbierane, po co, na jakiej podstawie i jak długo są trzymane. Sekcja "O projekcie"
   zawiera streszczenie i mówi wprost, że streszczenie to nie jest polityka.
2. **Regulamin** określający zasady korzystania i usuwania kont.
3. **Droga do usunięcia konta** działająca sama, bez pisania do nas. Prawo do usunięcia
   danych jest bezwarunkowe, a ręczna obsługa takich zgłoszeń przy projekcie prowadzonym
   po godzinach kończy się przekroczeniem terminów.

Do tego dochodzi umowa powierzenia z dostawcą hostingu, jeśli dane będą leżały u kogoś
innego, a będą. Usługi takie jak Supabase mają gotowy wzór takiej umowy.

## Przeniesienie istniejących danych

Wpisy z aktualności są dziś w pamięci przeglądarki. Panel redakcyjny ma eksport do pliku
JSON, którego kształt odpowiada tabelom `posts` i `post_images`. Import to odczytanie tego
pliku i wstawienie wierszy, bez żadnego przekształcania nazw pól.

Zdjęcia leżą w bazie IndexedDB jako zapis tekstowy. Przy przenoszeniu trzeba je zamienić
z powrotem na pliki i wgrać do magazynu plików, a w `post_images.storage_key` zapisać
ścieżkę. Same obrazy nie powinny trafić do bazy danych.
