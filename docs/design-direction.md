# AstroZenit: kierunek wizualny

## Zasada nadrzędna

Znak em dash nie występuje nigdzie w projekcie: ani w interfejsie, ani w treściach,
ani w kodzie, ani w komentarzach, ani w dokumentacji. W tekstach polskich używamy
przecinka, dwukropka, nawiasu albo krótkiego łącznika.

## Charakter

AstroZenit ma sprawiać wrażenie profesjonalnego planetarium połączonego z nowoczesnym
dashboardem. Nie jest zabawką i nie jest tapetą. Jest przyrządem. Każdy element
niesie informację, każda animacja tłumaczy zmianę stanu.

Trzy przymiotniki prowadzące wszystkie decyzje: **cichy, precyzyjny, głodny przestrzeni**.

Interfejs schodzi z drogi niebu. Mapa jest bohaterem, panele są narzędziami, które
pojawiają się na żądanie i znikają bez śladu.

## Paleta

Neutrale są tintowane w granat. Nigdzie nie występuje czysta czerń ani czysty szary,
bo żadne z nich nie istnieje w naturze.

| Token | Wartość | Rola |
| --- | --- | --- |
| `--surface-void` | `oklch(0.09 0.018 265)` | tło aplikacji, najgłębsza warstwa |
| `--surface-deep` | `oklch(0.13 0.020 265)` | panele, karty, sekcje |
| `--surface-raised` | `oklch(0.17 0.020 265)` | kontrolki, stan najechania |
| `--surface-overlay` | `oklch(0.21 0.020 265)` | podpowiedzi, kontrolki aktywne |
| `--hairline` | `oklch(1 0 0 / 0.08)` | obrysy o grubości jednego piksela |
| `--text-primary` | `oklch(0.96 0.005 265)` | treść główna |
| `--text-secondary` | `oklch(0.72 0.012 265)` | opisy, metadane |
| `--text-tertiary` | `oklch(0.60 0.014 265)` | etykiety, jednostki |
| `--accent` | `oklch(0.82 0.115 78)` | bursztyn, kolor światła gwiazd |
| `--signal-visible` | `oklch(0.78 0.09 210)` | wyłącznie stan "widoczne teraz" |
| `--signal-warn` | `oklch(0.75 0.11 45)` | warunki trudne |
| `--signal-down` | `oklch(0.60 0.05 265)` | obiekt pod horyzontem |

Jeden akcent. Nasycenie poniżej osiemdziesięciu procent. Świadomie omijamy
fioletowo niebieską estetykę generowanych interfejsów. Bursztyn wybrany dlatego,
że jest kolorem światła gwiazd typu G i K, gra kontrastem temperatury z zimnym
granatem tła i nie psuje adaptacji wzroku do ciemności.

Cienie są tintowane w granat, nigdy czarne.

Wszystkie kolory tekstu zostały zmierzone względem trzech powierzchni, na których
występują. Najniższy wynik to 4,84 dla `--text-tertiary` na kontrolce, czyli powyżej
progu 4,5 wymaganego przez WCAG AA.

## Typografia

| Krój | Zastosowanie |
| --- | --- |
| Instrument Serif | nagłówki sekcji, duże liczby, nazwy obiektów |
| Instrument Sans | cały interfejs, treść, przyciski, etykiety |
| JetBrains Mono | współrzędne, czasy, magnitudo, odległości |

Liczby zawsze z `font-variant-numeric: tabular-nums`, żeby nie skakały przy zmianie
wartości w czasie rzeczywistym.

Skala modularna o współczynniku 1,25, płynna przez `clamp()` tylko dla nagłówków
sekcji. Reszta interfejsu ma skalę stałą w `rem`, bo gęsty dashboard potrzebuje
przewidywalności przestrzennej.

Długość wiersza tekstu ciągłego ograniczona do `62ch`.

## Materiał

Glassmorphism występuje wyłącznie na panelach unoszących się nad mapą nieba:

```
background: oklch(0.13 0.02 265 / 0.72);
backdrop-filter: blur(24px) saturate(140%);
border: 1px solid var(--hairline);
box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.06), 0 24px 60px -20px oklch(0.05 0.02 265 / 0.8);
```

Sekcje pełnoekranowe są nieprzezroczyste. Rozmycie nigdy nie trafia na kontener,
który się przewija, bo powoduje ciągłe przemalowania na karcie graficznej.

## Kształt

Promienie liczą się koncentrycznie: kontener 20 px, kontrolka wewnątrz 12 px,
element wewnątrz kontrolki 8 px. Chipy i pigułki 999 px.

## Ruch

| Token | Krzywa | Zastosowanie |
| --- | --- | --- |
| `--ease-panel` | `cubic-bezier(0.32, 0.72, 0, 1)` | wejście i wyjście paneli |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | mikrointerakcje |
| `--ease-inout` | `cubic-bezier(0.77, 0, 0.175, 1)` | ruch obiektu po ekranie |

Czasy: 140 ms dla reakcji na naciśnięcie, 180 ms dla podpowiedzi, 220 ms dla paneli
bocznych, 280 ms dla arkuszy pełnoekranowych. Nic powyżej 300 ms.

Wszystko, co da się nacisnąć, reaguje `transform: scale(0.97)` w stanie `:active`.
Animujemy wyłącznie `transform`, `opacity`, `filter` i `clip-path`.

Zero odbić i zero sprężystości. Wejście list ze schodkowaniem 40 ms.

Przy `prefers-reduced-motion: reduce` gasną wszystkie ruchy pozycyjne, migotanie
i płynne przewijanie czasu. Zostają przejścia przezroczystości i koloru.

## Zakazy

- losowe gradienty; jedyne dopuszczone to poświata przy horyzoncie i gradient nieba,
  oba wyliczane z rzeczywistej wysokości Słońca
- neonowe poświaty i zewnętrzne glow na elementach interfejsu
- tekst wypełniony gradientem
- emoji w kodzie, treści i tekstach alternatywnych
- ikony o mieszanej grubości kreski; cały zestaw ma jedną wartość `stroke-width`
- karta w karcie
- trzy równe kolumny kart jako układ sekcji
- czysta czerń i czysty szary
