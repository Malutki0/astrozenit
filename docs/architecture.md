# AstroZenit: architektura

## Warstwy

```
public/data/            artefakty katalogu, generowane skryptem, wersjonowane w repozytorium
  stars.bin             8 920 gwiazd do wielkości 6,5, format binarny, 139 KB
  stars-named.json      795 gwiazd z opisem, nazwami i danymi fizycznymi
  constellations.json   88 figur Międzynarodowej Unii Astronomicznej
  boundaries.json       781 odcinków granic gwiazdozbiorów
  asterisms.json        26 asteryzmów
  dso.json              110 obiektów katalogu Messiera
  locations.json        4 070 miejsc obserwacji ze skalą Bortle'a

src/lib/astro/          obliczenia astronomiczne
src/lib/catalog/        wczytywanie katalogu i transformacja do układu horyzontalnego
src/lib/render/         silnik rysowania mapy nieba
src/lib/objects.ts      ujednolicony opis obiektu, wspólny dla wszystkich sekcji
src/state/              stan aplikacji poza drzewem Reacta
src/components/         powłoka, mapa, panele, sekcje, prymitywy interfejsu
```

## Ścieżka danych do ekranu

```
katalog binarny  ->  wektory jednostkowe J2000  ->  macierz obrotu  ->  wektory horyzontalne
                                                          |
                                     projekcja stereograficzna  ->  piksele
```

Kluczowy podział: **obrót zależy od czasu i miejsca, projekcja od kadru**.
Wektory horyzontalne przeliczamy tylko wtedy, gdy zmieni się chwila albo lokalizacja.
Przesuwanie i przybliżanie mapy dotyka wyłącznie projekcji, która jest tania.

Macierz obrotu pochodzi z `Rotation_EQJ_HOR` biblioteki astronomy-engine i zawiera
precesję, nutację, czas gwiazdowy oraz położenie obserwatora. Zastosowanie jej do
całego katalogu kosztuje dziewięć mnożeń i sześć dodawań na gwiazdę, bez ani jednej
funkcji trygonometrycznej. Dla dziewięciu tysięcy gwiazd to ułamek milisekundy.

Zmierzona wydajność przy 1400 na 880 pikseli, ze wszystkimi warstwami: mediana 1,3 ms
na klatkę, dziewięćdziesiąty piąty percentyl 2,5 ms. Budżet klatki wynosi 16 ms.

Trzy rzeczy, które wcześniej kosztowały najwięcej i zostały naprawione:

- Zegar zapisywał nową chwilę pięć razy na sekundę, przez co cały interfejs przerysowywał
  się bez powodu. Teraz zapis następuje dopiero przy zmianie pełnej sekundy.
- Oś czasu i wykres widoczności planet przeliczały okno nocy przy każdym tyknięciu zegara.
  Obie rzeczy zależą od doby, a nie od chwili, więc są zapamiętywane po kluczu nocy.
- Położenia księżyców Jowisza były liczone w pętli rysowania. To pełne obliczenie orbitalne,
  które trafiło tam, gdzie jego miejsce, czyli do przeliczania efemeryd.

## Horyzont liczony analitycznie

Rzut stereograficzny odwzorowuje okręgi na sferze w okręgi na płaszczyźnie, więc obraz
horyzontu jest okręgiem, który da się policzyć wprost, bez próbkowania.

Dla punktu v jego rzut spełnia zależność v.F = (4 - s) / (4 + s), gdzie s to kwadrat
odległości od środka kadru w jednostkach projekcji. Podstawiając warunek horyzontu
v.z = 0 i zapisując zenit w bazie kamery jako (0, cos h, sin h), otrzymujemy okrąg
o środku w punkcie (0, 2 ctg h) i promieniu 2 / |sin h|, gdzie h to wysokość
kierunku patrzenia. Zgodność z rzutowaniem numerycznym została sprawdzona
do piętnastu miejsc po przecinku.

Znak wyrażenia rozstrzyga też, po której stronie okręgu leży grunt: patrząc w górę
jest on na zewnątrz, patrząc w dół w środku. Poprzednie rozwiązanie próbkowało horyzont
i testowało położenie nadiru w wielokącie, co zawodziło, gdy horyzont rozpadał się
na kilka odcinków.

**Kolejność rysowania ma znaczenie.** Grunt jest rysowany po całej treści nieba,
a nie przed nią. Rysowany wcześniej nie przesłaniałby linii figur i granic
gwiazdozbiorów, które celowo są przycinane nieco poniżej horyzontu, żeby dochodziły
do jego krawędzi bez przerwy.

## Grunt i profil terenu

Grunt jest rysowany po treści nieba, a nie przed nią, inaczej linie figur i granice
prześwitują spod ziemi. Jego barwa idzie za wysokością Słońca, tak samo jak barwa nieba:
ziemia świeci wyłącznie światłem odbitym, więc w nocy zostaje z tego prawie czerń, a w dzień
matowa oliwkowa szarość. Bez tego grunt w dzień był czarną dziurą pod błękitnym niebem.

Wzdłuż horyzontu biegnie profil terenu: suma kilku sinusoid o całkowitych okresach na pełnym
obrocie, dzięki czemu jest ciągły i zamyka się bez szwu. Zmierzony zakres to od 0,12 do 2,47
stopnia. Tyle właśnie zabiera realnemu obserwatorowi linia drzew albo dalekie wzgórza,
a jednocześnie tak nisko, że nie chowa niczego, co dałoby się sensownie obserwować.
Pas między horyzontem a profilem rysujemy próbkując oba w tych samych azymutach, dzięki czemu
wielokąt zamyka się dokładnie niezależnie od tego, jak projekcja wygina krawędź.

Kierunki świata są podpisane skrótami N, NE, E, SE, S, SW, W, NW. Są standardem w astronomii
i nawigacji także w polskich publikacjach, nie mylą się z niczym innym i zgadzają się
z opisami azymutu w pozostałych częściach aplikacji.

## Droga Mleczna

Pas nie jest rysowany proceduralnie. Źródłem jest panorama całego nieba wykonana przez
Serge Bruniera w ramach projektu GigaGalaxy Zoom Europejskiego Obserwatorium Południowego,
zapisana w odwzorowaniu walcowym we współrzędnych galaktycznych. Plik waży 152 KB.

Rysowanie polega na odwzorowaniu odwrotnym. Dla węzłów siatki rozpiętej co osiem pikseli
bufora odczytujemy kierunek na niebie, przenosimy go jedną złożoną macierzą z układu
horyzontalnego wprost do galaktycznego i stąd na położenie w teksturze. Dla pikseli
pomiędzy węzłami współrzędne teksturowe interpolujemy dwuliniowo, bo projekcja zmienia
się gładko. Na klatkę przypada więc około tysiąca dokładnych przeliczeń zamiast
kilkudziesięciu tysięcy.

Bufor ma rozdzielczość obniżoną pięciokrotnie i jest skalowany w górę z wygładzaniem.
Pas jest z natury miękki, więc nic na tym nie traci, a wypełniamy dwadzieścia pięć razy
mniej pikseli. Bufor pikseli powstaje raz i jest używany ponownie, żeby nie obciążać
odśmiecacza pamięci.

Widoczność zależy od dwóch rzeczy. Skala Bortle'a miejsca obserwacji decyduje, czy pas
w ogóle widać: przy wartości 3 jest wyraźny, przy 6 ledwie dostrzegalny, od 8 w górę
znika. Drugim czynnikiem jest przybliżenie: panorama ma rozdzielczość około jednej
trzeciej stopnia na piksel, więc przy polu widzenia poniżej dwunastu stopni wygaszamy ją
płynnie, zamiast pokazywać rozciągnięte kwadraty.

## Tarcze planet i Księżyca

Mapy powierzchni pochodzą z serwisu Solar System Scope na licencji CC BY 4.0, opracowane
na podstawie zdjęć NASA. Osiem map jest sklejonych w jeden atlas 2048 na 512 pikseli,
co daje jedno żądanie sieciowe i jedno dekodowanie zamiast ośmiu. Plik waży 155 KB.

Tarcza powstaje przez odwzorowanie odwrotne: dla każdego piksela koła liczymy punkt na
kuli, zamieniamy go na współrzędne w odwzorowaniu walcowym i odczytujemy barwę z mapy.
Dochodzi do tego nachylenie osi obrotu, przez co Uran leży na boku tak jak w naturze,
oraz pociemnienie brzegowe.

Gotowe tarcze są zapamiętywane w rozmiarach zaokrąglonych do potęg dwójki. Bez tego przy
płynnym przybliżaniu powstawałaby nowa tarcza w każdej klatce, a każda kosztuje kilkadziesiąt
tysięcy odczytów z mapy.

Fazę nakładamy na płótnie pomocniczym trybem usuwania, dzięki czemu w miejscu cienia widać
niebo, a nie zamalowaną plamę. Kąt obrotu terminatora wynika z kąta pozycyjnego jasnego
brzegu liczonego wzorem Meeusa, przeniesionego na ekran przez rzutowanie punktów
przesuniętych na północ i na wschód. Przy Księżycu zostaje ślad światła popielatego.

Saturn dostaje pierścienie o promieniach odpowiadających rzeczywistym, ze spłaszczeniem
wynikającym z kąta otwarcia zwracanego przez silnik efemeryd, rysowane w dwóch połowach:
tylnej pod tarczą i przedniej na niej. Przy Jowiszu, po przybliżeniu, pojawiają się cztery
księżyce galileuszowe.

**Tarcze są celowo powiększone ponad skalę.** Jowisz ma w rzeczywistości czterdzieści pięć
sekund łuku, czyli przy typowym kadrze mniej niż jedną dziesiątą piksela. Rysowany wiernie
byłby niewidoczny. Powiększenie rośnie wraz z przybliżeniem, a księżyce Jowisza są skalowane
tym samym współczynnikiem, więc układ pozostaje wewnętrznie spójny.

## Aktualności

Wpisy są przechowywane w pamięci przeglądarki, bo aplikacja nie ma zaplecza serwerowego.
Panel redakcyjny pozwala je dodawać, poprawiać i usuwać, a eksport tworzy plik JSON gotowy
do wczytania w innym systemie. To świadomy kompromis, a nie przeoczenie: przeniesienie treści
do prawdziwego systemu zarządzania treścią sprowadza się do podmiany dwóch funkcji
w `src/lib/news.ts`.

Wpisy dołączone razem z aplikacją opisują rzeczy powszechnie znane, a nie zmyślone
doniesienia prasowe. Nie są niczym oznaczane, bo czytelnik ma je traktować jak każdą inną
treść. Przycisk w panelu pozwala przywrócić ten zestaw po skasowaniu wszystkiego.

W odróżnieniu od pozostałych sekcji aktualności są pełnymi podstronami, a nie panelami nad
mapą. Tekst do czytania potrzebuje szerokości i spokojnego tła, a nie szklanej płyty nad
ruchomym niebem. Szyna nawigacji leży nad podstroną, więc wyjście jest zawsze pod ręką.

### Zdjęcia w artykułach

Obrazy nie mieszczą się w pamięci lokalnej razem z tekstem, bo ta ma około pięciu megabajtów
pojemności. Trafiają więc do bazy IndexedDB (`src/lib/media.ts`), a we wpisie zostaje sam
identyfikator: `coverId` dla okładki i `imageIds` dla galerii.

Każdy plik jest przed zapisem przerysowywany na płótnie do 1600 pikseli szerokości i
zapisywany ponownie jako JPEG. Ma to trzy skutki naraz: plik maleje kilkunastokrotnie,
znikają z niego dane dodatkowe, w tym współrzędne miejsca wykonania zdjęcia, a przeglądarka
odrzuca wszystko, co nie jest prawdziwym obrazem, bo plik podszywający się pod zdjęcie nie
przejdzie przez dekoder.

W treści wpisu akapit złożony wyłącznie ze znacznika `[zdjecie:N]` zamienia się na zdjęcie
o tym numerze. Celowo nie przyjmujemy tu kodu HTML. Gdyby redaktor mógł wstawić dowolny
znacznik, wpis stałby się drogą do wstrzyknięcia skryptu, a to jedyne realne zagrożenie
w aplikacji bez serwera. Zdjęcie wybrane na okładkę otwiera artykuł, więc jego znacznik
w treści jest pomijany, żeby ten sam obraz nie pojawił się dwa razy pod rząd.

### Ograniczenia nakładane na dane wejściowe

W aplikacji nie ma bazy SQL ani serwera, więc wstrzyknięcie zapytania nie ma gdzie zadziałać.
Realne zagrożenie jest inne i sprowadza się do dwóch przypadków, obu obsłużonych
w `src/lib/news.ts`:

- treść wpisu nigdy nie trafia do `dangerouslySetInnerHTML`, tylko jest wstawiana jako tekst,
- odnośnik do źródła musi mieć schemat `http` albo `https`, przez co `javascript:` odpada.

Poza tym każde pole ma twardy limit długości, z tekstu usuwane są znaki sterujące, a wczytanie
pliku z kopią odrzuca dane większe niż dziesięć megabajtów, listy dłuższe niż dwa tysiące
wpisów oraz pozycje o niewłaściwym kształcie. Uszkodzony albo złośliwie spreparowany plik
kopii nie może więc zepsuć aplikacji: w najgorszym razie zostanie odrzucony w całości.

## Konta i logowanie

Sprawdzanie hasła odbywa się na urządzeniu użytkownika, bo nie ma serwera, który mógłby to
zrobić. Trzeba powiedzieć wprost, co to znaczy.

Co ten mechanizm daje: hasło nigdy nie jest przechowywane jawnie, tylko jako skrót PBKDF2
z solą i trzystoma dziesięcioma tysiącami powtórzeń, porównywany w stałym czasie; kolejne
nieudane próby są opóźniane wykładniczo, do pięciu minut; panel redakcyjny jest niedostępny
dla zwykłego odwiedzającego. Sesja żyje w pamięci karty i wygasa po ośmiu godzinach.

Czego nie daje: ochrony treści przed kimś, kto zna narzędzia deweloperskie. Taka osoba obejdzie
ten mechanizm w kilka minut. Prawdziwe zabezpieczenie wymaga serwera, który sprawdza hasło
i wydaje token.

Miejsce podmiany jest jedno: interfejs `AuthProvider` w `src/lib/auth.ts`. Implementacja zdalna
ma odpytać własne API i zwrócić ten sam kształt wyniku, a reszta aplikacji nie wymaga żadnych
zmian. Ta sama uwaga jest widoczna dla użytkownika w zakładce konta, bo ukrywanie jej byłoby
gorsze niż brak logowania w ogóle.

## Kalendarz wieloletni

Kalendarz ma dwa zakresy: pojedynczy miesiąc i spis sięgający do końca przyszłego roku
kalendarzowego. Zakres liczy się od dnia otwarcia aplikacji, więc przesuwa się sam i nie
wymaga corocznej poprawki w kodzie.

Kosztem w tym drugim zakresie są zbliżenia, bo minimum odległości kątowej znajdujemy
próbkowaniem. Krok musi być wyraźnie krótszy niż czas trwania zjawiska. Księżyc przesuwa się
mniej więcej trzynaście stopni na dobę, przez co jego zbliżenie mieści się w kilku godzinach
i wymaga kroku sześciogodzinnego, a to daje kilkaset milisekund liczenia dla szesnastu
miesięcy. Pary planet zmieniają się przez wiele dni, więc dla nich wystarcza krok dobowy.

Dlatego spis wieloletni pomija zbliżenia Księżyca, które i tak powtarzają się co miesiąc,
a pary planet próbkuje co dobę. Sprawdzone porównaniem: dla roku od września 2026 krok dobowy
i sześciogodzinny znajdują dokładnie ten sam zestaw dziewięciu zbliżeń planet. Całość liczy
się wtedy około stu pięćdziesięciu milisekund i jest odkładana o jedną klatkę, żeby przełącznik
zdążył się przerysować, a użytkownik zobaczył szkielet listy zamiast zamrożonego interfejsu.

## Stan poza Reactem

Store zbudowany na bibliotece zustand żyje poza drzewem komponentów. Pętla animacji
czyta go przez `getState()`, więc przeciągnięcie mapy nie renderuje ani jednego
komponentu Reacta. Panele czytają ten sam store przez selektory atomowe.

## Podmiana źródła danych na zewnętrzne API

`src/lib/astro/provider.ts` definiuje kontrakt `EphemerisProvider`. Domyślna
implementacja `LocalEphemerisProvider` liczy wszystko w przeglądarce i działa
bez sieci. Żeby podpiąć NASA JPL Horizons, SIMBAD albo własny serwis, wystarczy
napisać drugą klasę spełniającą ten sam interfejs.

Metody są asynchroniczne celowo, mimo że implementacja lokalna zwraca wynik od razu.
Dzięki temu przejście na źródło zdalne nie wymaga zmian w komponentach.

Wyjątek, świadomy i udokumentowany: rysowanie mapy nie korzysta z tego interfejsu
i sięga wprost po funkcje lokalne. Pętla animacji potrzebuje wyników synchronicznie,
sześćdziesiąt razy na sekundę, czego żadne zdalne API nie obsłuży, a mapa ma działać
także bez połączenia.

## Podział ról: Kalendarz i Zjawiska

Obie sekcje czytały z tej samej funkcji `generateEvents()` i pokazywały tę samą płaską
listę. Pomiar w oknie stu osiemdziesięciu dni: Kalendarz pokazywał dwadzieścia pięć pozycji,
Zjawiska czterdzieści dziewięć, a dwadzieścia cztery z tych dwudziestu pięciu były wspólne.
Pokrycie dziewięćdziesiąt sześć procent oznaczało, że jedna z sekcji była zbędna.

Podział jest teraz jednoznaczny:

**Kalendarz odpowiada na pytanie KIEDY.** Jest chronologicznym spisem dat i ma dwa widoki
tej samej treści: jedną ciągłą listę od dziś do końca przyszłego roku, pogrupowaną miesiącami,
oraz siatkę pojedynczego miesiąca z fazą Księżyca na każdy dzień i szczegółami wybranego dnia.
Nie tłumaczy zjawisk, tylko mówi, kiedy wypadają.

**Zjawiska odpowiadają na pytanie CO.** Wyjaśniają, czym dany rodzaj zjawiska jest,
dlaczego wygląda tak, a nie inaczej, i na co zwrócić uwagę przy obserwacji. Daty są tam
dodatkiem do wyjaśnienia: przy każdym rodzaju stoi kilka najbliższych wystąpień, szukanych
na trzy lata naprzód, bo zaćmienie widoczne z danego miejsca potrafi się nie zdarzyć
przez ponad rok. Zbliżeń tam nie ma wcale, bo są liczne i chronologiczne, czyli należą
do Kalendarza.

### Jeden zakres zamiast przełącznika

Kalendarz miał wcześniej przełącznik zakresu: miesiąc albo spis do końca przyszłego roku.
Okazał się zbędny, bo lista i tak jest pogrupowana miesiącami, więc jeden ciągły spis
przewijany w dół daje to samo, tylko bez zmuszania do wyboru zakresu przed zobaczeniem
czegokolwiek. Został jeden przełącznik, między listą a siatką, i ten ma uzasadnienie:
siatka odpowiada na inne pytanie, mianowicie co wypada konkretnego dnia.

### Odsiew zamiast filtra był błędem

Spis wieloletni miał zaszyty w kodzie odsiew: tylko ranga 1 i 2, z faz Księżyca tylko pełnia
i nów. Ze stu dwudziestu policzonych wydarzeń zostawało sześćdziesiąt sześć, przez co
Kalendarz wyglądał na uboższy od Zjawisk, choć liczył to samo. Decyzja, co jest warte
pokazania, należy do obserwatora, więc odsiew zastąpił jawny filtr rodzaju z licznikami
przy każdej pozycji. Domyślnie wybrane jest "Warte uwagi", ale widać, ile kryje się
pod pozostałymi.

Jedyne, czego na liście nie ma, to zbliżenia Księżyca z planetami. Wypadają co miesiąc
i przez szesnaście miesięcy dałyby około dwustu wierszy, pod którymi zginęłoby wszystko inne.
Widać je w siatce miesiąca po kliknięciu dnia, a interfejs mówi o tym wprost.

## Ocena warunków obserwacyjnych

Ocena łączy trzy rzeczy: geometrię, jasność tła nieba i pogodę. Kolejność ma znaczenie,
bo pierwsza wersja tego rachunku dodawała wszystkie składniki do siebie i przez to kłamała.

**Co było źle.** Punkty za wysokość nad horyzontem i za ciemność nieba dodawały się
niezależnie od tego, czy obiekt jest w ogóle dostrzegalny. Jowisz stojący wysoko o dziewiątej
rano dostawał ocenę doskonałą, a gwiazda 6.5 mag na miejskim niebie dostawała ocenę dobrą
razem z uzasadnieniem mówiącym, że jest za słaba.

**Jak jest teraz.** Zapas jasności ponad próg widoczności działa jako mnożnik, a nie jako
składnik sumy. Obiekt poniżej progu nie staje się lepiej widoczny przez to, że stoi w zenicie.
Tak samo działają zachmurzenie i zamglenie: chmura nie pogarsza warunków o kilka punktów,
tylko odbiera możliwość obserwacji.

Próg widoczności to ostrzejszy z dwóch: lokalne zanieczyszczenie nieba światłem w skali
Bortle'a i jasność tła wynikająca z wysokości Słońca. Ta druga jest liczona z punktów
odniesienia odpowiadających temu, co realnie widać: przy Słońcu nad horyzontem gołym okiem
widać wyłącznie Słońce, Księżyc i, przy dobrej przejrzystości, Wenus, więc próg wynosi
tam minus cztery wielkości gwiazdowe.

Słońce jest liczone osobno, bo samo ten próg ustala i zdanie "niebo jest zbyt jasne, żeby
zobaczyć Słońce" byłoby absurdem. Dla Słońca liczy się tylko wysokość i zachmurzenie,
a uzasadnienie zawsze zawiera ostrzeżenie o filtrze.

Kontrola liczbowa: `npm run verify:conditions`.

## Pogoda

Prognoza jest jedyną częścią aplikacji, która wymaga sieci. Źródłem jest Open-Meteo,
wybrany dlatego, że jako jedyny z darmowych daje wszystko, czego potrzebuje ocena warunków,
bez klucza, który w aplikacji działającej wyłącznie w przeglądarce i tak trzeba by trzymać
jawnie. Dane są na licencji CC BY 4.0.

Punkt podmiany: interfejs `WeatherProvider` w `src/lib/weather/types.ts`.

Odpowiedź jest zapamiętywana na pół godziny, bo modele pogodowe odświeżają się co godzinę
i częstsze pytanie to obciążanie cudzego serwera bez powodu. Przy błędzie sieci ocena
warunków wraca do trybu bez chmur i mówi o tym wprost, zamiast udawać, że nic się nie stało.

### Mapa zachmurzenia

Zamiast pobierać gotowe kafelki z obrazem satelitarnym budujemy własną siatkę siedem na
siedem punktów, pytamy o zachmurzenie w każdym z nich i wygładzamy wynik interpolacją
dwusześcienną. Powody: obraz z satelity pokazuje wyłącznie stan bieżący, a przy planowaniu
obserwacji potrzebna jest odpowiedź na pytanie, jak będzie za trzy godziny; darmowe serwisy
z kafelkami znikają albo zaczynają wymagać klucza; a prognoza w postaci liczb pozwala
narysować mapę w barwach reszty aplikacji. Kosztem jest rozdzielczość około siedemdziesięciu
kilometrów, co wystarcza do decyzji o dojeździe i nie udaje dokładności, której w prognozie nie ma.

## Satelity

Sztuczne satelity są jedynym rodzajem obiektu w tej aplikacji, którego położenia nie da się
policzyć z samych praw ruchu. Niska orbita jest ciągle zaburzana przez opór resztek atmosfery,
spłaszczenie Ziemi i manewry korekcyjne, więc trzeba pobrać aktualne elementy orbitalne
i propagować je modelem SGP4 z biblioteki `satellite.js` (MIT).

Elementy pochodzą z Celestraku, z grup "visual" i "stations", i są w domenie publicznej.
Starzeją się szybko: po tygodniu błąd momentu przelotu sięga kilku minut, dlatego wiek
zestawu jest zawsze pokazywany, a przy braku sieci sięgamy po kopię wbudowaną w aplikację
(`npm run build:satellites`).

Widoczny przelot wymaga trzech rzeczy naraz i o trzeciej najłatwiej zapomnieć: satelita nad
horyzontem, satelita poza cieniem Ziemi i obserwator w ciemności. Dlatego widoczne przeloty
zdarzają się głównie w godzinie po zmierzchu i przed świtem: na dole jest już ciemno,
a na wysokości czterystu kilometrów wciąż świeci Słońce. Cień liczymy modelem walcowym,
a jasność wzorem uwzględniającym odległość i kąt fazowy, tak samo jak u planet.

Moduły jednej stacji kosmicznej są w katalogu osobnymi obiektami na praktycznie tej samej
orbicie, więc ich nakładające się przeloty sklejamy w jeden wpis.

Warstwa na mapie przelicza położenia z krokiem jednej sekundy czasu symulacji, osobno
od reszty efemeryd, bo satelita przemierza pół stopnia na sekundę, czyli sto razy szybciej
niż cokolwiek innego na tej mapie. Pełne przeliczenie stu siedemdziesięciu obiektów trwa
około czterech milisekund, więc rozłożone na sekundę pracy pętli kosztuje ułamek klatki.
Zmierzony wpływ na czas klatki: mediana rośnie z 1.6 do 2.1 ms.

## Upływ czasu

Czas płynie w pętli klatek, a nie w liczniku czasu. Wcześniej przesuwał go `setInterval`
co ćwierć sekundy, a w trybie bieżącym data zmieniała się dopiero przy zmianie pełnej
sekundy, przez co niebo skakało. Do renderera idzie wartość dokładna w każdej klatce,
a do sklepu stanu tylko raz na sekundę, bo każdy zapis przerysowuje drzewo Reacta.
Uchwyt osi czasu jest sterowany kanałem `onPreciseTime`, z pominięciem Reacta.

Zmiana mnożnika wyłącza tryb bieżący i to jest konieczne, a nie kosmetyczne: w trybie
bieżącym pętla ustawia czas na teraz przy każdej klatce, więc mnożnik nie ma czego
przesuwać. Bez tego wciśnięcie odtwarzania nie robiło nic, dopóki użytkownik nie ruszył
czasu ręcznie.

Krok przeliczania efemeryd zależy od mnożnika: przy podglądzie na żywo dwie sekundy,
przy szybkim przewijaniu jedna klatka. Pełne przeliczenie kosztuje około 0.4 ms, więc
nawet co klatkę mieści się w budżecie.

## Sterowanie ruchem telefonu

Na urządzeniu dotykowym z czujnikiem orientacji mapa może podążać za telefonem: skierowanie
telefonu w niebo obraca mapę w ten sam punkt. Warunkiem jest kontekst uznany przez przeglądarkę
za bezpieczny, czyli połączenie szyfrowane albo adres localhost. Na zwykłym http czujnik
nie zostanie udostępniony i żaden komunikat nie wyjaśni przyczyny, dlatego aplikacja
rozpoznaje ten przypadek sama i mówi o nim wprost. Do testów służy `npm run dev:https`.

Cztery pułapki i sposób ich obejścia opisuje `src/state/useDeviceOrientation.ts`: skąd wiadomo, gdzie jest
północ (inaczej na urządzeniach Apple, inaczej na pozostałych), zgoda wymagana od trzynastej
wersji systemu Apple i wyłącznie w odpowiedzi na dotknięcie, oraz wygładzanie drgającego
odczytu po sinusie i cosinusie kąta, a nie po samym kącie, żeby przejście przez północ
nie obracało mapy o pełny obrót.

## Skala Bortle'a w ocenie widoczności

Baza lokalizacji Stellarium podaje dla każdego miejsca stopień zanieczyszczenia nieba
światłem w skali Bortle'a od 1 do 9. Przekładamy go na graniczną wielkość gwiazdową
widoczną gołym okiem, od 7,8 magnitudo w miejscu pierwotnie ciemnym do 4,0 w centrum
wielkiego miasta.

Ta wartość wchodzi bezpośrednio do funkcji `rateVisibility`, razem z ekstynkcją
atmosferyczną liczoną wzorem Pickeringa na masę powietrza. Efekt: ten sam obiekt
dostaje inną ocenę z Warszawy i z Bieszczadów, i jest to różnica wynikająca z fizyki,
a nie z arbitralnego mnożnika.

## Źródła danych i licencje

| Źródło | Licencja | Co z niego bierzemy |
| --- | --- | --- |
| HYG Database v41 | CC BY-SA 4.0 | pozycje, jasności, odległości i typy widmowe gwiazd |
| Stellarium | CC BY-SA 4.0 dla danych kultur nieba, GPL-2.0 dla programu | figury gwiazdozbiorów po numerach HIP, granice Międzynarodowej Unii Astronomicznej, asteryzmy, nazwy własne gwiazd, polskie nazwy i dopełniacze, baza lokalizacji ze skalą Bortle'a |
| GeoNames cities5000 | CC BY 4.0 | poprawna pisownia nazw miejscowości wraz z polskimi znakami |
| d3-celestial | BSD 3-Clause | katalog Messiera |
| Europejskie Obserwatorium Południowe, GigaGalaxy Zoom, Serge Brunier | CC BY 4.0 | panorama Drogi Mlecznej |
| Solar System Scope | CC BY 4.0 | mapy powierzchni planet i Księżyca |
| astronomy-engine | MIT | efemerydy, wschody i zachody, fazy, zaćmienia, elongacje |
| satellite.js | MIT | model SGP4, czyli propagacja orbit sztucznych satelitów |
| Celestrak | domena publiczna | elementy orbitalne satelitów, grupy "visual" i "stations" |
| Open-Meteo | CC BY 4.0 | prognoza zachmurzenia, widzialności, temperatury i punktu rosy |

### Dlaczego nie stellarium-web-engine

Istnieje gotowy silnik webowy Stellarium, ale jego licencja to **AGPL v3 albo licencja
komercyjna**. AGPL przy serwisie internetowym oznacza, że każdy użytkownik ma prawo
zażądać pełnych źródeł całego serwisu na tej samej licencji, co przy projektach
komercyjnych jest warunkiem nie do przyjęcia bez wykupienia licencji od Stellarium Labs.

Dlatego korzystamy z danych Stellarium, które są na licencji przyzwalającej, i piszemy
własny silnik rysowania. Jest on prostszy, waży kilkaset linii zamiast kilku megabajtów
WebAssembly, działa w pełni bez sieci i pozwala na własny język wizualny, o który
prosił brief.

## Przebudowa katalogu

```
npm run build:catalog    pobiera źródła, przelicza je i zapisuje do public/data
npm run verify:astro     kontrola poprawności obliczeń astronomicznych
```

Skrypt budujący zawiera kontrole spójności, między innymi wykrywanie powtórzonych
nazw i dopełniaczy gwiazdozbiorów. To właśnie ta kontrola wychwyciła błąd w polskim
tłumaczeniu Stellarium, gdzie dopełniacz Centaura był podany jako dopełniacz Byka.
Poprawka jest w `scripts/data/constellations-pl.mjs` razem z uzasadnieniem.
