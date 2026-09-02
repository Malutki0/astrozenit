# Konwencje projektu

Krótka lista rzeczy, których pilnujemy w kodzie i w treściach. Nie są to reguły ogólne,
tylko decyzje podjęte w tym projekcie, każda z powodem.

## Znak długiego myślnika

Długi myślnik, czyli znak o numerze U+2014, nie występuje nigdzie: ani w interfejsie,
ani w treściach, ani w kodzie, ani w komentarzach, ani w dokumentacji. W polszczyźnie
zastępuje go przecinek, dwukropek, nawias albo zwykły dywiz.

Ten akapit nie pokazuje samego znaku, bo kontrola sprawdza wszystkie pliki repozytorium
i nie robi wyjątku dla dokumentu opisującego regułę. Wyjątek byłby zresztą początkiem
końca reguły.

Pilnuje tego `npm run check:dash`, wchodzące w skład `npm run verify`.

Powód jest praktyczny: znak ten wygląda w polskim składzie obco, bywa mylony z półpauzą,
a w treściach pobieranych i tłumaczonych maszynowo pojawia się sam z siebie. Jedna zasada
i jedno sprawdzenie są tańsze niż poprawianie tego przy każdym tekście.

## Język

Kod, komentarze, nazwy zmiennych w częściach dziedzinowych i cała dokumentacja po polsku.
Nazwy z bibliotek zewnętrznych zostają w oryginale.

## Komentarze

Komentarz tłumaczy, dlaczego coś jest zrobione tak, a nie inaczej, zwłaszcza gdy wybór
był nieoczywisty albo gdy pierwsze podejście nie zadziałało. Komentarz powtarzający to,
co widać w kodzie, jest zbędny.

## Testy

Test zapisuje oczekiwanie wynikające ze zjawiska, a nie ze wzoru, który sprawdza.
Test przepisujący wzór z kodu potwierdza wyłącznie, że dwa razy popełniono tę samą
pomyłkę. Kosztowało to już raz odwrócenie osi pionowej w kompasie, które przeszło
przez kontrolę napisaną w ten sposób.
