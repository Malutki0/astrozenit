# AstroZenit w sieci, za darmo, krok po kroku

Instrukcja od zera do działającej strony z kontami. Wszystko poniżej mieści się w planach
bezpłatnych. Jedyny wydatek, i to nieobowiązkowy, to domena `.pl`.

Zanim zaczniesz, sprawdź czas: kroki 1 do 4 to około czterdziestu minut, głównie czekania
na formularze rejestracyjne. Krok 5 możesz zrobić kiedy indziej.

---

## Co wybieramy i dlaczego

| Element | Wybór | Koszt | Dlaczego ten |
| --- | --- | --- | --- |
| Strona | Netlify | 0 zł | 100 GB miesięcznie, HTTPS i własna domena w cenie, konfiguracja już napisana |
| Konta i baza | Supabase | 0 zł | PostgreSQL 500 MB, a przede wszystkim **wysyłka poczty w cenie** |
| Odświeżanie newsów | GitHub Actions | 0 zł | plik harmonogramu już napisany |
| Domena | opcjonalnie `.pl` | od kilkunastu zł/rok | do czasu zakupu działa adres `nazwa.netlify.app` |

**Dlaczego nie MySQL.** Napisałem też wersję z MySQL, leży w `server/php` i działa,
ale wymaga hostingu z PHP, a taki nie ma sensownej wersji darmowej. Co ważniejsze,
nie rozwiązuje wysyłki poczty: bez niej nie da się potwierdzić adresu ani odzyskać
zapomnianego hasła. Supabase robi obie te rzeczy za nas. Wersja z MySQL zostaje w repozytorium
na wypadek, gdybyś kiedyś wykupił hosting i chciał trzymać wszystko u siebie.

---

## Krok 1: repozytorium na GitHubie

Bez tego nie zadziała ani hosting, ani odświeżanie newsów: obie rzeczy uruchamiają się
z repozytorium.

```bash
cd /Users/piotr/calude/zenit
git init
git add -A
git commit -m "AstroZenit"
```

Załóż konto na **github.com**, jeżeli jeszcze nie masz, i utwórz nowe repozytorium.
Nazwa dowolna, na przykład `astrozenit`. **Prywatne jest w porządku**, Netlify obsługuje
prywatne repozytoria.

Po utworzeniu GitHub pokaże dwie linie do skopiowania. Wykonaj je:

```bash
git remote add origin https://github.com/TWOJA-NAZWA/astrozenit.git
git branch -M main
git push -u origin main
```

**Sprawdzenie:** odśwież stronę repozytorium, pliki powinny być widoczne.

---

## Krok 2: strona na Netlify

1. Wejdź na **netlify.com**, zaloguj się przyciskiem **GitHub**.
2. **Add new site** → **Import an existing project** → **GitHub** → wybierz repozytorium.
3. Netlify pokaże ustawienia budowania. **Nie zmieniaj nic**: plik `netlify.toml`
   w repozytorium już podaje polecenie i katalog wyjściowy.
4. **Deploy**.

Pierwsze budowanie trwa dwie, trzy minuty. Potem dostaniesz adres w rodzaju
`losowa-nazwa-123.netlify.app`.

Nazwę zmienisz w **Site configuration** → **Change site name**, na przykład na `astrozenit`.

**Sprawdzenie:** otwórz adres, mapa nieba powinna się narysować. Sprawdź też na telefonie,
bo **to jest połączenie szyfrowane i kompas w końcu zadziała bez ostrzeżeń o certyfikacie**.

---

## Krok 3: baza i konta w Supabase

1. Wejdź na **supabase.com**, załóż konto przez GitHub.
2. **New project**. Nazwa dowolna. **Region wybierz europejski**, na przykład Frankfurt:
   dane osobowe obywateli Unii wygodniej trzymać w Unii.
3. Ustaw hasło do bazy i **zapisz je**. Nie będzie potrzebne na co dzień, ale bez niego
   nie wejdziesz do bazy poleceniami.
4. Poczekaj dwie minuty, aż projekt się postawi.

### Tabele

Zakładka **SQL Editor** → **New query**. Wklej całą zawartość pliku
`server/schema-supabase.sql` z repozytorium i naciśnij **Run**.

**Sprawdzenie, i tego nie pomijaj.** W SQL Editor wykonaj:

```sql
select relname, relrowsecurity from pg_class
where relname in ('favourites', 'consents');
```

Obie tabele muszą mieć `relrowsecurity` równe `true`. Jeżeli któraś ma `false`,
**ulubione wszystkich użytkowników są publiczne**, bo Supabase wystawia bazę wprost
do przeglądarki. Wtedy uruchom schemat jeszcze raz.

### Potwierdzanie adresu

Zakładka **Authentication** → **Providers** → **Email**. Włącz **Confirm email**.

Bez tego da się zakładać konta na cudze adresy, a formularz rejestracji zamienia się
w narzędzie do wysyłania niechcianej poczty cudzym nazwiskiem.

W **Authentication** → **URL Configuration** wpisz w **Site URL** adres swojej strony
z kroku 2. To pod ten adres wróci użytkownik po kliknięciu w odnośnik potwierdzający.

### Klucze

Zakładka **Project Settings** → **API**. Potrzebne są dwie wartości:

- **Project URL**, w rodzaju `https://abcdefgh.supabase.co`
- **anon public**, długi ciąg zaczynający się od `eyJ`

Klucz `anon` jest publiczny z założenia i ląduje w kodzie strony. To nie jest wyciek:
on sam nic nie otwiera, bo dostępu pilnują zasady ochrony wierszy uruchomione wyżej.
**Klucza `service_role` nie kopiuj nigdzie**, ten otwiera wszystko.

---

## Krok 4: połączenie strony z bazą

Wróć do Netlify: **Site configuration** → **Environment variables** → **Add a variable**.

Dodaj dwie:

```
VITE_SUPABASE_URL       https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY  eyJ...
```

Potem **Deploys** → **Trigger deploy** → **Deploy site**, bo zmienne wczytują się
przy budowaniu, a nie w locie.

**Sprawdzenie:** wejdź na stronę, zakładka Konto, załóż konto na swój prawdziwy adres.
Powinna przyjść wiadomość z odnośnikiem potwierdzającym. Po potwierdzeniu zaloguj się
i dodaj coś do Ulubionych. W Supabase, zakładka **Table Editor** → `favourites`,
wiersz musi tam być.

Od tej chwili konta są wspólne dla wszystkich urządzeń, a zdanie o koncie zapisanym
w przeglądarce znika samo, bo przestaje być prawdziwe.

---

## Krok 5: dobowe odświeżanie aktualności

W repozytorium na GitHubie:

1. **Settings** → **Actions** → **General** → **Workflow permissions** → zaznacz
   **Read and write permissions** → **Save**. Bez tego krok zapisujący zmiany padnie
   na braku uprawnień.
2. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   Nazwa `ANTHROPIC_API_KEY`, wartość to klucz z console.anthropic.com. Bez niego
   pobieranie działa, ale nowe wpisy NASA zostają po angielsku.
3. Zakładka **Actions** → **Aktualnosci** → **Run workflow**. Uruchom ręcznie, żeby
   sprawdzić od razu, a nie czekać dobę.

Po udanym uruchomieniu powstanie commit, Netlify przebuduje stronę i newsy będą świeże.

---

## Krok 6: domena, gdy zechcesz

Do tego momentu wszystko działa pod adresem `astrozenit.netlify.app` i nic nie kosztuje.

Domenę `.pl` kupisz u OVH, home.pl, nazwa.pl albo cyberFolks. **Sprawdź cenę odnowienia,
nie pierwszego roku**: pierwszy rok bywa promocyjny i kilkukrotnie tańszy od kolejnych.

Po zakupie w Netlify: **Domain management** → **Add a domain**, wpisz `astrozenit.pl`,
Netlify poda serwery nazw, które trzeba wpisać u rejestratora. Certyfikat HTTPS wystawia
się sam w ciągu kilkunastu minut.

Pamiętaj potem zmienić **Site URL** w Supabase na nową domenę, bo inaczej odnośniki
potwierdzające będą prowadzić pod stary adres.

### Poczta na kontakt@astrozenit.pl

Ten adres stoi w regulaminie, więc musi działać. Sama domena poczty nie daje.
Najtańsze wyjście to **Cloudflare Email Routing**: za darmo przekierowuje
`kontakt@astrozenit.pl` na twoją istniejącą skrzynkę. Wymaga trzymania DNS domeny
w Cloudflare. Do odbierania wystarcza, do wysyłania z tego adresu już nie.

---

## Czego wciąż brakuje

**Adresu do korespondencji w dokumentach.** Regulamin i polityka prywatności mają
uzupełnione nazwisko, adres poczty i datę, ale nie mają adresu pocztowego. Przepisy
wymagają danych kontaktowych pozwalających się skontaktować z administratorem, a sam
adres poczty bywa uznawany za za mało przy skardze do urzędu. Uzupełnia się to
w `src/config/legal.ts`, pole `address`.

---

## Podsumowanie kosztów

| | Miesięcznie | Rocznie |
| --- | --- | --- |
| Netlify | 0 zł | 0 zł |
| Supabase | 0 zł | 0 zł |
| GitHub | 0 zł | 0 zł |
| Tłumaczenie newsów | około 2 zł | około 25 zł |
| Domena `.pl` | | od kilkunastu zł, sprawdź cenę odnowienia |

Bez klucza do tłumaczenia i bez domeny całość kosztuje zero i działa.
