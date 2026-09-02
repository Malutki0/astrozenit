# AstroZenit

Mapa nocnego nieba liczona w przeglądarce. Pokazuje, co widać z konkretnego miejsca
i o konkretnej porze: położenia planet, fazy Księżyca, gwiazdozbiory, przeloty satelitów,
kalendarz zjawisk i prognozę zachmurzenia.

Nic nie jest liczone na serwerze, bo serwera nie ma. Katalog gwiazd i modele ruchu ciał
niebieskich lądują w przeglądarce i tam wykonują całą pracę.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja stanie na porcie 5174.

Do sprawdzenia kompasu na telefonie potrzebne jest połączenie szyfrowane, bo czujnik
orientacji działa wyłącznie w bezpiecznym kontekście:

```bash
npm run dev:https
```

## Polecenia

| Polecenie | Do czego |
| --- | --- |
| `npm run dev` | serwer deweloperski |
| `npm run build` | wersja produkcyjna do katalogu `dist` |
| `npm run preview` | podgląd wersji produkcyjnej |
| `npm run verify` | kontrola obliczeń astronomicznych i audyt znaku myślnika |
| `npm run fetch:news` | pobranie i tłumaczenie aktualności |
| `npm run build:catalog` | przetworzenie katalogu gwiazd ze źródeł |
| `npm run build:satellites` | pobranie danych orbitalnych |
| `npm run build:photos` | pobranie zdjęć obiektów z licencją do sprawdzenia |

## Zasada projektu

Znak długiego myślnika nie występuje nigdzie: ani w interfejsie, ani w treściach, ani
w kodzie, ani w komentarzach. Pilnuje tego `npm run check:dash`, wchodzące w skład
`npm run verify`.

## Skąd biorą się dane

| Źródło | Co daje | Licencja |
| --- | --- | --- |
| astronomy-engine | położenia ciał, wschody, zachody, fazy, zaćmienia | MIT |
| HYG Database v41 | katalog gwiazd | CC BY-SA 4.0 |
| d3-celestial | linie gwiazdozbiorów, katalog Messiera | BSD-3 |
| Open-Meteo | prognoza pogody i zachmurzenia | CC BY 4.0 |
| OpenStreetMap | kafelki mapy regionu | ODbL |
| Celestrak | dane orbitalne satelitów | publicznie dostępne |
| NASA | teksty i zdjęcia w aktualnościach | dobro publiczne, z wyjątkami |

Zdjęcia NASA nie są objęte jedną licencją: agencja publikuje też prace astrofotografów
na własnej licencji. Skrypt pobierający je odrzuca, rozpoznając adnotację w nazwie pliku.

## Wdrożenie

**Zacznij od [docs/start-za-darmo.md](docs/start-za-darmo.md)**: od zera do działającej
strony z kontami, w całości na planach bezpłatnych.

Pozostałe opisy, gdy będą potrzebne:

| Plik | O czym |
| --- | --- |
| [docs/wdrozenie.md](docs/wdrozenie.md) | całość architektury i decyzje |
| [docs/baza-mysql.md](docs/baza-mysql.md) | własne zaplecze w PHP na hostingu z MySQL |
| [server/README.md](server/README.md) | wymagania i obowiązki przy prowadzeniu kont |

## Dokumenty

Regulamin i polityka prywatności są w aplikacji, pod `#/regulamin` i `#/prywatnosc`.
Przedstawiają się jako projekt, dopóki nie zostaną uzupełnione dane administratora
w `src/config/legal.ts`.
