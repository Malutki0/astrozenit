/*
 * FILTR SZKŁA: PRAWDZIWA REFRAKCJA
 *
 * Rozmycie tła to nie jest szkło. Szkło załamuje światło, czyli przesuwa obraz tego,
 * co za nim, i przesuwa go tym mocniej, im bliżej krawędzi, bo tam promień biegnie
 * przez taflę pod większym kątem. Do tego rozszczepia barwy: czerwień, zieleń i błękit
 * mają różne współczynniki załamania, więc na krawędzi grubego szkła widać kolorowy
 * rąbek. Tego nie da się udać samym rozmyciem ani obwódką.
 *
 * JAK TO DZIAŁA
 *
 * feDisplacementMap przesuwa każdy piksel obrazu o wektor odczytany z drugiego obrazu,
 * zwanego mapą przemieszczenia: kanał czerwony mówi, o ile w poziomie, zielony o ile
 * w pionie. Wartość 128 oznacza brak przesunięcia, 255 przesunięcie w jedną stronę,
 * 0 w drugą.
 *
 * Mapę budujemy sami, dwoma gradientami złożonymi trybem screen. Poziomy gradient
 * niesie kanał czerwony, pionowy zielony, a screen z dwóch barw rozłącznych daje
 * dokładnie sumę kanałów. Oba mają w środku wartość 128 na przestrzeni ponad połowy
 * szerokości, więc środek tafli nie jest w ogóle zniekształcony, a całe załamanie
 * skupia się przy brzegach, tak jak w soczewce płasko-wypukłej.
 *
 * Przemieszczenie liczymy trzy razy, dla każdego kanału z inną siłą, i składamy
 * z powrotem. Stąd bierze się kolorowy rąbek na krawędzi. Na końcu delikatne rozmycie,
 * bo prawdziwa tafla nigdy nie jest idealnie gładka.
 *
 * GDZIE DZIAŁA
 *
 * Filtry SVG w backdrop-filter obsługują silniki oparte na Chromium, czyli Chrome,
 * Edge, Opera i przeglądarki na Androidzie. Safari i Firefox obsługują backdrop-filter,
 * ale bez odwołań do filtrów SVG. Dlatego arkusz stylów pyta o to wprost przez @supports
 * i tam, gdzie odpowiedź jest odmowna, zostaje wersja z pierścieniem, która daje ten sam
 * odczyt materiału innymi środkami. Nie jest to gorsza wersja z braku laku, tylko drugi
 * sposób powiedzenia tego samego.
 */

/* Rozdzielczość mapy. Sto dwadzieścia ośm pikseli wystarcza, bo mapa to same gradienty:
 * feImage i tak rozciąga ją na rozmiar elementu, a gradient rozciągnięty pozostaje gradientem. */
const MAPA = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
<defs>
<linearGradient id="x" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="rgb(255,0,0)"/>
<stop offset="0.14" stop-color="rgb(190,0,0)"/>
<stop offset="0.32" stop-color="rgb(128,0,0)"/>
<stop offset="0.68" stop-color="rgb(128,0,0)"/>
<stop offset="0.86" stop-color="rgb(66,0,0)"/>
<stop offset="1" stop-color="rgb(0,0,0)"/>
</linearGradient>
<linearGradient id="y" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="rgb(0,255,0)"/>
<stop offset="0.14" stop-color="rgb(0,190,0)"/>
<stop offset="0.32" stop-color="rgb(0,128,0)"/>
<stop offset="0.68" stop-color="rgb(0,128,0)"/>
<stop offset="0.86" stop-color="rgb(0,66,0)"/>
<stop offset="1" stop-color="rgb(0,0,0)"/>
</linearGradient>
</defs>
<rect width="128" height="128" fill="url(#x)"/>
<rect width="128" height="128" fill="url(#y)" style="mix-blend-mode:screen"/>
</svg>`;

const ZRODLO_MAPY = `data:image/svg+xml;utf8,${encodeURIComponent(MAPA)}`;

/*
 * Siła załamania osobno dla każdego kanału barwy.
 *
 * Rozstęp między trzema wartościami to szerokość kolorowego rąbka na krawędzi.
 * Pierwsza wersja miała rozstęp ośmiu pikseli i było to za dużo: nad jasną gwiazdą
 * pojawiały się wyraźne czerwone i niebieskie plamy, które czytało się jako usterkę
 * rysowania, a nie jako własność szkła. Cztery piksele dają rąbek widoczny przy
 * uważnym patrzeniu i niezauważalny przy zwykłym, czyli dokładnie tyle, ile widać
 * na krawędzi prawdziwej tafli.
 */
const SILA = { r: -16, g: -18, b: -20 };
/* Wersja dla powierzchni cienkich. Pasek wysoki na sześćdziesiąt pikseli przy pełnej
 * sile załamywałby sam siebie: strefa krawędziowa spotkałaby się pośrodku. */
const SILA_CIENKA = { r: -8, g: -9, b: -10 };

/*
 * Rozproszenie w tafli.
 *
 * Samo załamanie przesuwa obraz, ale go nie zmiękcza, więc gwiazdy prześwitywały
 * przez szkło ostrymi punktami i tafla wyglądała raczej na wygiętą folię niż na szkło.
 * Prawdziwa tafla nigdy nie jest doskonale przezroczysta: światło rozprasza się na
 * niejednorodnościach materiału i na obu powierzchniach, więc to, co za nią, jest
 * zawsze odrobinę zmiękczone.
 *
 * Sześć pikseli dla tafli grubych, cztery dla cienkich. Więcej zaciera samo załamanie,
 * bo rozmycie działa po przesunięciu i zjada różnicę między kanałami, na której
 * cały efekt się opiera.
 *
 * Uwaga przy zmianie: na czas ruchu kamery glass.module.css podmienia ten filtr na
 * zwykłe rozmycie i musi wtedy rozmywać dokładnie tyle samo, inaczej tafle zachodzą
 * mgłą przy każdym chwyceniu mapy. Wartości tam są przepisane z tych stałych, więc
 * zmiana w tym miejscu wymaga zmiany również tam.
 */
const ROZPROSZENIE = 6;
const ROZPROSZENIE_CIENKIE = 4;

function Kanaly({
  id,
  sila,
  rozproszenie,
}: {
  id: string;
  sila: { r: number; g: number; b: number };
  rozproszenie: number;
}) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feImage
        x="0"
        y="0"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        result="mapa"
        href={ZRODLO_MAPY}
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="mapa"
        result="przesR"
        scale={sila.r}
        xChannelSelector="R"
        yChannelSelector="G"
      />
      <feColorMatrix
        in="przesR"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="czerwony"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="mapa"
        result="przesG"
        scale={sila.g}
        xChannelSelector="R"
        yChannelSelector="G"
      />
      <feColorMatrix
        in="przesG"
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="zielony"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="mapa"
        result="przesB"
        scale={sila.b}
        xChannelSelector="R"
        yChannelSelector="G"
      />
      <feColorMatrix
        in="przesB"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
        result="niebieski"
      />
      <feBlend in="czerwony" in2="zielony" mode="screen" result="cz" />
      <feBlend in="cz" in2="niebieski" mode="screen" result="zlozony" />
      <feGaussianBlur in="zlozony" stdDeviation={rozproszenie} />
    </filter>
  );
}

/**
 * Definicje filtrów. Wstawiane raz, w powłoce aplikacji. Sam znacznik jest niewidoczny
 * i nie zajmuje miejsca: nosi wyłącznie definicje, do których odwołują się arkusze stylów.
 */
export function GlassFilter() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <Kanaly id="zenit-szklo" sila={SILA} rozproszenie={ROZPROSZENIE} />
        <Kanaly
          id="zenit-szklo-cienkie"
          sila={SILA_CIENKA}
          rozproszenie={ROZPROSZENIE_CIENKIE}
        />
      </defs>
    </svg>
  );
}
