import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TileMap } from '@/components/map/TileMap';
import { formatTime } from '@/lib/format';
import type { CloudGrid } from '@/lib/weather/types';
import type { GeoLocation } from '@/lib/astro/types';

import styles from './sections.module.css';

/*
 * Mapa zachmurzenia w okolicy.
 *
 * Nie jest to zdjęcie z satelity, tylko prognoza policzona dla siatki siedem na siedem
 * punktów i wygładzona interpolacją dwusześcienną. Wybór jest świadomy: gotowe kafelki
 * z obrazem satelitarnym pokazują wyłącznie stan bieżący, a przy planowaniu obserwacji
 * potrzebna jest odpowiedź na pytanie, jak będzie za trzy godziny.
 *
 * Pod chmurami leży prawdziwa mapa z nazwami miejscowości, bo sama plama zachmurzenia
 * nad czarnym tłem nie odpowiada na pytanie, które użytkownik naprawdę zadaje:
 * dokąd konkretnie jechać. Mapa jest przyciemniona, żeby nie rozświetlała ekranu.
 *
 * Rozdzielczość siatki to około siedemdziesięciu kilometrów. To wystarcza do decyzji
 * "jechać na wschód czy zostać", a nie udaje dokładności, której w prognozie nie ma.
 */

/** Bok pomocniczego płótna, na którym rysujemy pole zachmurzenia przed nałożeniem na mapę. */
const FIELD = 256;

/** Interpolacja sześcienna Catmulla i Roma dla jednego wymiaru. */
function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * t + b) * t + c) * t + p1;
}

function sample(values: number[], size: number, x: number, y: number): number {
  const at = (col: number, row: number) =>
    values[Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, col))];

  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const tx = x - cx;
  const ty = y - cy;

  const rows: number[] = [];
  for (let r = -1; r <= 2; r++) {
    rows.push(cubic(at(cx - 1, cy + r), at(cx, cy + r), at(cx + 1, cy + r), at(cx + 2, cy + r), tx));
  }
  return cubic(rows[0], rows[1], rows[2], rows[3], ty);
}

export function CloudMap({
  grid,
  date,
  location,
}: {
  grid: CloudGrid;
  date: Date;
  location: GeoLocation;
}) {
  /* Indeks godziny w siatce, liczony względem chwili wybranej na osi czasu. */
  const initialIndex = useMemo(() => {
    const diff = Math.round((date.getTime() - grid.start.getTime()) / 3600_000);
    const max = Math.max(0, (grid.cells[0]?.cover.length ?? 1) - 1);
    return Math.min(max, Math.max(0, diff));
  }, [date, grid]);

  const [index, setIndex] = useState(initialIndex);
  useEffect(() => setIndex(initialIndex), [initialIndex]);

  /*
   * Przybliżenie dobrane tak, żeby obszar prognozy był szerszy niż kadr.
   *
   * Przy poziomie szóstym kwadrat czterystu kilometrów mieścił się w mapie w całości
   * i to był główny problem tego widoku: zachmurzenie wyglądało jak prostokątna naklejka
   * z ostrymi krawędziami leżąca na mapie Europy. Na poziomie ósmym kilometr ma niecałe
   * trzy piksele, więc bok kwadratu wypada koło tysiąca stu pikseli i wychodzi poza kadr
   * z obu stron. Widać wtedy chmury nad okolicą, a nie kwadrat z chmurami, a granicę
   * danych odsłania dopiero oddalenie mapy, czyli wtedy, gdy naprawdę o nią pytamy.
   */
  const [view, setView] = useState({ lat: location.lat, lon: location.lon, zoom: 8 });
  useEffect(() => {
    setView((v) => ({ ...v, lat: location.lat, lon: location.lon }));
  }, [location.lat, location.lon]);

  const hours = grid.cells[0]?.cover.length ?? 0;
  const hourTime = new Date(grid.start.getTime() + index * 3600_000);

  /* Wartości ułożone wierszami od północy do południa, żeby zgadzały się z ekranem. */
  const values = useMemo(() => {
    const size = grid.size;
    const out = new Array<number>(size * size).fill(0);
    for (let i = 0; i < grid.cells.length; i++) {
      const row = Math.floor(i / size);
      const col = i % size;
      /* Siatka powstała od najmniejszej szerokości, czyli od południa. Na ekranie
       * północ jest u góry, więc wiersze odwracamy. */
      out[(size - 1 - row) * size + col] = grid.cells[i].cover[index] ?? 0;
    }
    return out;
  }, [grid, index]);

  /*
   * Pole zachmurzenia rysujemy raz, na pomocnicze płótno o stałym boku, i dopiero potem
   * nakładamy na mapę. Dzięki temu koszt interpolacji nie zależy od tego, jak bardzo
   * mapa jest przybliżona, a przesuwanie mapy nie przelicza pola od nowa.
   */
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  if (!fieldRef.current && typeof document !== 'undefined') {
    fieldRef.current = document.createElement('canvas');
    fieldRef.current.width = FIELD;
    fieldRef.current.height = FIELD;
  }

  useEffect(() => {
    const canvas = fieldRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const image = ctx.createImageData(FIELD, FIELD);
    const size = grid.size;
    for (let py = 0; py < FIELD; py++) {
      for (let px = 0; px < FIELD; px++) {
        const cover = Math.max(
          0,
          Math.min(
            100,
            sample(values, size, (px / (FIELD - 1)) * (size - 1), (py / (FIELD - 1)) * (size - 1)),
          ),
        );
        const t = cover / 100;
        const i = (py * FIELD + px) * 4;
        /*
         * Barwa i krycie zmieniają się razem z pokryciem, a nie samo krycie.
         *
         * Poprzednia wersja malowała jedną biel o rosnącej nieprzezroczystości. Przy
         * zachmurzeniu wyrównanym w całym regionie, a tak jest najczęściej, dawało to
         * jednolitą białą płachtę: mapa pod spodem znikała, a różnica między
         * sześćdziesięcioma a dziewięćdziesięcioma procentami była nie do odczytania.
         *
         * Teraz cienkie zachmurzenie jest chłodną, szaroniebieską mgłą, a gęste dopiero
         * dochodzi do bieli. Dwie zmieniające się wielkości zamiast jednej dają czytelną
         * różnicę także tam, gdzie pokrycie waha się o kilkanaście punktów.
         *
         * Barwy dobrane pod jasne kafelki OpenStreetMap.
         *
         * Wcześniej chmury szły od szarości do bieli, bo mapa pod spodem była granatowa.
         * Po powrocie do jasnej mapy biel przestała cokolwiek znaczyć: kremowe tło mapy
         * i biała chmura mają niemal tę samą jasność, więc gęste zachmurzenie było
         * niewidoczne. Teraz idziemy w drugą stronę, od bladego błękitu do średniego
         * błękitu łupkowego, czyli im gęstsze chmury, tym ciemniejsza i mocniej nasycona
         * plama. Odczyt jest przy tym zgodny z intuicją, bo zachmurzone niebo kojarzy się
         * z szarością, a nie z rozjaśnieniem.
         *
         * Krycie kończy się na 0.57 i tam też się kończy zapas. Sprawdzone na barwach,
         * które naprawdę występują na kafelku: podpis miejscowości ma pod taką zasłoną
         * kontrast około 3 do 1 wobec tła, a że OpenStreetMap otacza podpisy jasną obwódką,
         * w praktyce zostają czytelne. Pierwsza próba kończyła się na 0.48 i przy typowym
         * zachmurzeniu rzędu sześćdziesięciu procent mapa wyglądała na czystą, bo plama
         * miała wtedy ledwie ćwierć krycia. Mapa, na której nie widać chmur, jest tak samo
         * bezużyteczna jak mapa, na której nie widać nazw, więc zapas poszedł w chmury.
         */
        const mieszanie = Math.pow(t, 0.85);
        image.data[i] = Math.round(158 + (72 - 158) * mieszanie);
        image.data[i + 1] = Math.round(186 + (110 - 186) * mieszanie);
        image.data[i + 2] = Math.round(218 + (162 - 218) * mieszanie);
        image.data[i + 3] = Math.round(145 * Math.pow(t, 1.1));
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [values, grid.size]);

  /*
   * Nałożenie pola na mapę.
   *
   * Siatka obejmuje około czterystu kilometrów, a na takim obszarze zniekształcenie
   * odwzorowania Merkatora jest poniżej procenta, więc wystarczy wyliczyć położenie
   * dwóch przeciwległych narożników i rozciągnąć obraz między nie. Pełne przeliczanie
   * piksel po pikselu byłoby dokładniejsze o wartość niemierzalną w prognozie,
   * której rozdzielczość i tak wynosi siedemdziesiąt kilometrów.
   */
  const overlay = useCallback(
    ({
      ctx,
      project,
    }: {
      ctx: CanvasRenderingContext2D;
      project: (lat: number, lon: number) => { x: number; y: number };
    }) => {
      const field = fieldRef.current;
      if (!field) return;
      const north = grid.centerLat + grid.spanLat / 2;
      const south = grid.centerLat - grid.spanLat / 2;
      const west = grid.centerLon - grid.spanLon / 2;
      const east = grid.centerLon + grid.spanLon / 2;
      const topLeft = project(north, west);
      const bottomRight = project(south, east);
      const szerokosc = bottomRight.x - topLeft.x;
      const wysokosc = bottomRight.y - topLeft.y;

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, topLeft.x, topLeft.y, szerokosc, wysokosc);

      /*
       * Granica obszaru prognozy.
       *
       * Prognoza obejmuje kwadrat o boku około czterystu kilometrów wokół miejsca
       * obserwacji i tylko tyle. Bez zaznaczonej granicy oddalenie mapy wyglądało
       * na usterkę: chmury kończyły się w połowie ekranu, jakby dalej było czyste
       * niebo, a nie brak danych. Cienka ramka mówi wprost, dokąd sięga to,
       * co pokazujemy, i gdzie zaczyna się nasza niewiedza.
       */
      ctx.save();
      /*
       * Ramka jest podwójna: ciemna pod spodem i jasna przerywana na wierzchu. Pojedyncza
       * jasna linia ginęła tam, gdzie graniczyła z gęstym zachmurzeniem, czyli dokładnie
       * tam, gdzie granica jest najbardziej myląca. Ciemna podkładka daje jej kontrast
       * niezależnie od tego, co leży pod spodem.
       */
      ctx.strokeStyle = 'rgb(255 255 255 / 0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, szerokosc - 1, wysokosc - 1);
      ctx.strokeStyle = 'rgb(30 52 88 / 0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, szerokosc - 1, wysokosc - 1);
      ctx.restore();
    },
    [grid],
  );

  /* Zakres wartości w tej godzinie, do opisu słownego pod mapą. */
  const stats = useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const center = values[Math.floor(values.length / 2)];
    return { min: Math.round(min), max: Math.round(max), center: Math.round(center) };
  }, [values]);

  return (
    <div>
      <TileMap
        lat={view.lat}
        lon={view.lon}
        zoom={view.zoom}
        onViewChange={setView}
        marker={{ lat: location.lat, lon: location.lon }}
        overlay={overlay}
        height={340}
        /*
         * Zakres powiększenia dobrany do zasięgu danych. Poniżej szóstego poziomu
         * obszar prognozy zajmowałby skrawek ekranu i znów wyglądał jak naklejka,
         * a powyżej dziewiątego widać byłoby wyłącznie wynik wygładzania między
         * punktami siatki, czyli obraz dokładniejszy, niż są dane pod spodem.
         */
        minZoom={6}
        maxZoom={9}
        /*
         * Legenda zamiast zdania.
         *
         * Wcześniej w rogu mapy leżał akapit tłumaczący, że jaśniejsze plamy to gęstsze
         * chmury. Zajmował ćwiartkę kadru, zasłaniał okolicę na północny zachód od
         * miejsca obserwacji i i tak nie pozwalał odczytać, czy dana plama znaczy
         * czterdzieści procent, czy osiemdziesiąt. Pasek z podziałką odpowiada na to
         * pytanie w ułamku miejsca, a samo objaśnienie przeniosło się pod mapę.
         */
        legend={
          <>
            <span className={styles.cloudLegendBar} aria-hidden="true" />
            <span className={styles.cloudLegendScale}>
              <span>czyste</span>
              <span>pełne</span>
            </span>
          </>
        }
      />

      <div className={styles.cloudMapControls}>
        <span className={`${styles.cloudMapTime} num`}>{formatTime(hourTime)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, hours - 1)}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className={styles.cloudMapSlider}
          aria-label="Godzina prognozy zachmurzenia"
          aria-valuetext={`${formatTime(hourTime)}, zachmurzenie w miejscu obserwacji ${stats.center} procent`}
        />
        <span className={styles.cloudMapSpan}>{Math.round(grid.spanLat * 111)} km</span>
      </div>

      <p className={styles.hint}>
        Zachmurzenie o {formatTime(hourTime)}: w miejscu obserwacji {stats.center} procent,
        w całym obszarze od {stats.min} do {stats.max} procent. Przerywana ramka to zasięg
        prognozy, poza nią danych nie mamy.
        {stats.max - stats.min > 35
          ? ' Różnice w regionie są duże, więc dojazd w stronę czystszego nieba może się opłacić.'
          : ' Zachmurzenie jest wyrównane w całym regionie, przejazd niewiele zmieni.'}
      </p>

      {/*
        * Uczciwe postawienie sprawy: co dokładnie tu widać.
        *
        * Mapa wygląda na ciągły obraz chmur, a jest wygładzeniem między
        * czterdziestoma dziewięcioma punktami prognozy oddalonymi o kilkadziesiąt
        * kilometrów. Bez tego zdania łatwo odczytać z niej więcej, niż w niej jest,
        * i wyciągnąć wniosek o pojedynczej dziurze w chmurach nad konkretną wsią,
        * którego te dane nie uprawniają.
        */}
      <p className={styles.hint}>
        Prognoza jest liczona w {grid.size} na {grid.size} punktach oddalonych o około{' '}
        {Math.round((grid.spanLat * 111) / (grid.size - 1))} km. Plamy między punktami są
        wygładzeniem, a nie pomiarem, więc mapa mówi o pogodzie w regionie, a nie nad
        konkretną miejscowością.
      </p>
    </div>
  );
}
