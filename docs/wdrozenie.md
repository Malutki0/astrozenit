# Wdrożenie AstroZenitu

Instrukcja od pustego katalogu do działającej strony z kontami i samoodświeżającymi się
aktualnościami. Kroki są w kolejności, w jakiej trzeba je wykonać, bo każdy następny
opiera się na poprzednim.

Stan wyjściowy: projekt działa lokalnie, nie jest w repozytorium, nie ma hostingu ani bazy.

## Z czego to się składa

Aplikacja jest stroną statyczną, czyli zbiorem plików bez własnego serwera. To upraszcza
jedno i komplikuje drugie. Upraszcza hosting, bo pliki może serwować dowolna usługa za
darmo. Komplikuje konta, bo nie ma gdzie sprawdzić hasła: wszystko, co dzieje się
w przeglądarce, jest pod kontrolą osoby, która przy niej siedzi.

Dlatego całość to trzy osobne rzeczy, które trzeba postawić niezależnie:

| Element | Do czego służy | Czym to postawić | Koszt |
| --- | --- | --- | --- |
| Strona | serwuje pliki aplikacji | Netlify albo Vercel | darmowy |
| Zaplecze kont | sprawdza hasła, trzyma ulubione | Supabase | darmowy do 500 MB |
| Odświeżanie newsów | raz na dobę pobiera i tłumaczy | GitHub Actions | darmowy |

Wszystkie trzy mają plany bezpłatne wystarczające przy tej skali. Płatny jest wyłącznie
klucz do tłumaczenia, rzędu kilku groszy dziennie.

## Krok 1: repozytorium

Bez tego nie zadziała ani hosting, ani odświeżanie newsów, bo obie rzeczy uruchamiają się
z repozytorium.

```bash
git init
git add -A
git commit -m "AstroZenit"
```

Potem trzeba założyć repozytorium na GitHubie i wypchnąć do niego gałąź główną.
Repozytorium może być prywatne, wszystkie potrzebne usługi działają z prywatnymi.

Sprawdzenie: `public/data/news.json` musi być w repozytorium. Nie jest ignorowany, ale
warto się upewnić, bo bez niego odświeżanie aktualności nie miałoby czego aktualizować.

```bash
git ls-files public/data/news.json
```

## Krok 2: strona

Na Netlify: nowa strona z repozytorium GitHuba, polecenie budowania `npm run build`,
katalog do opublikowania `dist`. Na Vercelu tak samo, tyle że wykrywa Vite sam.

Jedno ustawienie jest łatwe do przeoczenia. Aplikacja używa routingu po znaku krzyżyka
(`#/planety`, `#/chmury`), więc serwer dostaje zawsze żądanie o stronę główną i nie trzeba
konfigurować przekierowań. Gdyby routing kiedyś zmienił się na zwykłe ścieżki, trzeba
będzie dodać regułę przepisującą wszystko na `index.html`.

Po podpięciu każdy commit na gałęzi głównej przebudowuje stronę sam. To jest mechanizm,
z którego skorzysta odświeżanie newsów w kroku 4.

## Krok 3: konta

Tu jest najwięcej pracy i tu najłatwiej o błąd, którego skutki widać dopiero po wycieku.

### Dlaczego nie da się tego zrobić w przeglądarce

Rejestracja, która działa w aplikacji dzisiaj, zapisuje konto w pamięci przeglądarki.
Hasło jest liczone przez PBKDF2 z solą, więc nie leży jawnie, ale konto istnieje wyłącznie
na tym jednym urządzeniu i znika razem z danymi witryny. To wystarcza, żeby Ulubione miały
po czym rozróżniać użytkowników, i nie wystarcza do niczego więcej.

Prawdziwe konta wymagają serwera, który po prostu nie odda danych komuś, kto się nie
uwierzytelnił. Nie da się tego obejść lepszym kodem po stronie przeglądarki.

### Supabase, czyli najmniej pracy

Supabase daje bazę PostgreSQL razem z gotowym uwierzytelnianiem: rejestracją,
potwierdzaniem adresu, logowaniem i odzyskiwaniem hasła. Te rzeczy są zrobione, przetestowane
i utrzymywane przez kogoś innego, a przy kontach użytkowników to argument decydujący.

Kolejność:

1. Założyć projekt w Supabase, wybrać region europejski. Ma to znaczenie prawne: dane
   osobowe obywateli Unii wygodniej trzymać w Unii.
2. Uruchomić w edytorze SQL zawartość `server/schema.sql`, **ale bez tabel `users`,
   `sessions`, `tokens` i `auth_events`**. Supabase prowadzi własną tabelę `auth.users`
   i własną obsługę sesji, więc te cztery byłyby drugim, niespójnym rejestrem tego samego.
   Zostają `posts`, `post_images` i `favourites`.
3. W tabeli `favourites` zamienić odwołanie `user_id` na `references auth.users (id)`.
4. Włączyć Row Level Security na wszystkich tabelach i dodać zasadę, że użytkownik widzi
   i zmienia wyłącznie własne wiersze w `favourites`. Bez tego każdy zalogowany może czytać
   ulubione wszystkich, bo Supabase wystawia bazę wprost do przeglądarki.
5. W ustawieniach uwierzytelniania włączyć potwierdzanie adresu poczty i ustawić adres
   powrotny na domenę strony.

### Wpięcie w aplikację

Aplikacja ma na to jedno miejsce, interfejs `AuthProvider` w `src/lib/auth.ts`. Trzeba
napisać klasę `SupabaseAuthProvider`, która ten interfejs spełnia, czyli ma metody
`login`, `register` i `changePassword`, i woła bibliotekę `@supabase/supabase-js` zamiast
liczyć skróty lokalnie. To kilkadziesiąt linii. Potem jedna zmiana na końcu pliku:

```ts
export const authProvider: AuthProvider = new SupabaseAuthProvider();
```

Reszta aplikacji nie wymaga żadnych zmian, bo nigdzie nie sięga do środka tej warstwy.

Uwaga na `src/lib/authRemote.ts`. Ten plik jest gotową implementacją dla **własnego**
serwera zgodnego z `server/api.md`, a nie dla Supabase. Przy Supabase się go nie używa,
przy własnym serwerze w Node albo funkcjach bezserwerowych działa od razu.

### Czego nie wolno pominąć

Regulamin i polityka prywatności są napisane i dostępne pod `#/regulamin` oraz
`#/prywatnosc`. Oba przedstawiają się jednak jako projekt, dopóki nie zostaną uzupełnione
trzy rzeczy w `src/config/legal.ts`: kto formalnie odpowiada za dane, pod jakim adresem
i od kiedy dokument obowiązuje. Tych danych nie da się wyprowadzić z kodu i nie wolno ich
zmyślić, bo dokument kłamiący w punkcie o tożsamości administratora jest bezwartościowy.

Baza ma już tabelę `consents` z historią przyjęcia dokumentów, funkcję
`delete_user_account` kasującą konto naprawdę, a nie tylko oznaczającą je jako usunięte,
oraz `purge_old_auth_events` wykonującą obietnicę o kasowaniu zapisów logowania po
dziewięćdziesięciu dniach. Tę ostatnią trzeba podpiąć pod harmonogram bazy, bo obietnica
bez zadania, które ją wykonuje, jest tylko zdaniem na stronie.

Zostaje jeszcze umowa powierzenia z dostawcą hostingu, opisana w `server/README.md`.

## Krok 4: automatyczne aktualności

Plik `.github/workflows/aktualnosci.yml` jest gotowy. Uruchamia się o 5:20 czasu
uniwersalnego, czyli około 7:20 w Polsce, pobiera kanały NASA i AstroNETu, tłumaczy nowe
wpisy NASA na polski i zapisuje `public/data/news.json`. Commit wyzwala przebudowę strony
z kroku 2.

Po wypchnięciu repozytorium trzeba jeszcze:

1. **Settings → Actions → General → Workflow permissions** przestawić na
   „Read and write permissions". Bez tego krok zapisujący zmiany padnie na braku uprawnień.
2. **Settings → Secrets and variables → Actions** dodać `ANTHROPIC_API_KEY`. Bez klucza
   pobieranie działa, ale nowe wpisy NASA zostają po angielsku. Te już przetłumaczone
   zostają po polsku, bo skrypt ma pamięć przekładów i nie tłumaczy dwa razy tego samego.
3. Uruchomić raz ręcznie, przyciskiem „Run workflow" w zakładce Actions, zamiast czekać
   dobę na to, czy zadziała.

Opcjonalnie `NASA_API_KEY`, który zdejmuje limit dziesięciu zapytań na godzinę z klucza
pokazowego. Przy jednym uruchomieniu na dobę nie jest potrzebny.

Dwie rzeczy warto wiedzieć o samym GitHubie. Harmonogramy usypiają po sześćdziesięciu
dniach bez żadnej aktywności w repozytorium, więc przy projekcie odłożonym na wakacje
trzeba je będzie obudzić. Zadania z crona ruszają często kilkanaście minut po wyznaczonej
godzinie, co przy zadaniu dobowym nie ma znaczenia.

## Kolejność, w jakiej to działa

```
commit na GitHubie  ->  Netlify buduje  ->  strona aktualna
      ^
      |
GitHub Actions o 7:20  ->  pobiera newsy  ->  tłumaczy  ->  commit

przeglądarka  ->  Supabase  ->  sprawdza hasło, zwraca ulubione
```

Trzy tory niezależne od siebie. Awaria tłumaczenia nie psuje strony, awaria Supabase nie
psuje aktualności, a strona stoi dalej, nawet gdy nie działa żadne z tych dwóch.

## Co sprawdzić po wdrożeniu

1. Strona otwiera się pod właściwym adresem i mapa nieba się rysuje.
2. Zakładka Chmury pokazuje mapę regionu z kafelkami OpenStreetMap.
3. Aktualności pokazują wpisy z pliku, a nie tylko sześć wpisów wbudowanych.
4. Ręczne uruchomienie harmonogramu kończy się powodzeniem i tworzy commit.
5. Rejestracja zakłada konto, wylogowanie i ponowne logowanie działa.
6. Konto czytelnika **nie** wchodzi do panelu redakcyjnego pod `#/aktualnosci/panel`.
