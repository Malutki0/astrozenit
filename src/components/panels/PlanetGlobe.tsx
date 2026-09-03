import { useEffect, useRef, useState } from 'react';

import {
  loadPlanetAtlas,
  loadRingProfile,
  type PlanetAtlas,
  type RingProfile,
} from '@/lib/render/layers/planets';
import type { BodyKey } from '@/lib/astro/types';

import styles from './PlanetGlobe.module.css';
import { przechwycWskaznik } from '../../lib/wskaznik';

/*
 * Obracany globus planety.
 *
 * Ten sam sposób rysowania co tarcze na mapie nieba: dla każdego piksela odwracamy
 * rzut kuli na płaszczyznę i odczytujemy barwę z mapy powierzchni. Nie ma tu ani
 * biblioteki trójwymiarowej, ani warstwy WebGL, bo do jednej kuli byłyby przerostem
 * formy: mapy powierzchni już mamy, a rachunek to kilkanaście operacji na piksel.
 *
 * Trzy różnice względem tarcz na mapie nieba, i każda jest celowa.
 *
 * Tarcza na mapie pokazuje fazę, bo tam chodzi o to, co realnie widać przez teleskop.
 * Tutaj kula jest oświetlona w całości, bo to ilustracja obiektu, a nie jego widok
 * z Ziemi. Sierp Wenus byłby w tym miejscu mylący.
 *
 * Obrót jest sterowany palcem albo myszą, a przy bezczynności toczy się sam,
 * powoli i w tę stronę, w którą planeta obraca się naprawdę. Wenus i Uran obracają
 * się wstecznie i tutaj też się tak obracają.
 *
 * Rysujemy w stałej rozdzielczości i skalujemy obrazem, więc koszt klatki nie zależy
 * od tego, jak duży jest globus na ekranie.
 */

const RESOLUTION = 256;
/* Trzydzieści klatek na sekundę wystarcza dla powolnego obrotu, a zostawia
 * budżet mapie nieba, która rysuje się w tle. */
const FRAME_MS = 33;

/*
 * Ciała, dla których mamy mapę powierzchni.
 *
 * Ziemia nie jest ciałem, które pokazujemy na mapie nieba, bo się na nią patrzy,
 * a nie się ją ogląda. Jest jednak potrzebna do zilustrowania pór roku, bo to jej
 * nachylenie osi je powoduje. Dlatego mapę mamy, a wśród kluczy ciał niebieskich
 * Ziemi nie ma i nie powinno być.
 */
export type GlobeBody = BodyKey | 'earth';

/* Nachylenie osi obrotu do płaszczyzny orbity, w stopniach. */
const AXIAL_TILT: Partial<Record<GlobeBody, number>> = {
  earth: 23.44,
  mercury: 0.03,
  venus: 177.4,
  mars: 25.2,
  jupiter: 3.1,
  saturn: 26.7,
  uranus: 97.8,
  neptune: 28.3,
  moon: 6.7,
  sun: 7.25,
};

/*
 * Prędkość samoczynnego obrotu, w stopniach na sekundę. Wartości nie są w skali
 * rzeczywistych okresów obrotu, bo Wenus obracałaby się wtedy niezauważalnie,
 * a Jowisz zbyt szybko. Zachowany jest natomiast kierunek, który jest cechą planety,
 * a nie kwestią wygody: wartość dodatnia oznacza obrót prosty, czyli ku wschodowi,
 * ujemna wsteczny. Wenus i Uran obracają się wstecznie i tutaj też się tak obracają.
 */
const SPIN: Partial<Record<GlobeBody, number>> = {
  earth: 9,
  mercury: 5,
  venus: -4,
  mars: 8,
  jupiter: 12,
  saturn: 11,
  uranus: -7,
  neptune: 9,
  moon: 4,
  sun: 3,
};

export interface PlanetGlobeProps {
  body: GlobeBody;
  size?: number;
  /*
   * Ułamek tarczy oświetlony, od zera do jedynki. Podany włącza odwzorowanie
   * prawdziwej fazy zamiast umownego oświetlenia z lewej góry. Ma sens przy Księżycu,
   * gdzie faza jest treścią obrazu, a nie ozdobą.
   */
  illumination?: number;
  /** Czy faza przybywa. Rozstrzyga, po której stronie leży oświetlony rąbek. */
  waxing?: boolean;
  /*
   * Wstrzymanie samoczynnego obrotu. Konieczne dla Księżyca, bo obraca się on
   * synchronicznie i zawsze zwraca ku Ziemi tę samą stronę. Obracający się Księżyc
   * byłby błędem rzeczowym, a nie tylko wyborem estetycznym.
   */
  locked?: boolean;
  /*
   * Obraz nieruchomy, bez pętli klatek i bez przeciągania. Do miejsc, w których
   * globus jest ilustracją w spisie, a nie obiektem do obejrzenia z każdej strony:
   * kilkanaście animowanych kul w jednej liście kosztuje więcej niż daje.
   */
  still?: boolean;
}

/*
 * Nakłada barwę pierścienia na piksel wyniku.
 *
 * Profil pierścieni jest półprzezroczysty, więc barwę mieszamy z tym, co już
 * w buforze stoi: nad tarczą planety z jej powierzchnią, poza tarczą z pustką.
 * Uwzględniamy przy tym cień, który planeta rzuca na pierścienie. Nie jest to
 * ozdobnik: cień Saturna na pierścieniach widać w każdym amatorskim teleskopie
 * i to on nadaje układowi głębię, po której oko rozpoznaje, że pierścień
 * naprawdę okrąża kulę, a nie leży na obrazku obok niej.
 */
function writeRing(
  out: Uint8ClampedArray,
  o: number,
  rings: RingProfile,
  radius: number,
  light: number,
  x: number,
  y: number,
  z: number,
  edge: number,
): void {
  const t = (radius - rings.innerRadius) / (rings.outerRadius - rings.innerRadius);
  const i = Math.max(0, Math.min(rings.samples - 1, (t * rings.samples) | 0)) * 4;
  const alpha = (rings.rgba[i + 3] / 255) * edge;
  if (alpha <= 0.004) return;

  /*
   * Cień planety. Punkt pierścienia leży w cieniu, gdy jest po ciemnej stronie
   * względem kierunku światła, a jego odległość od osi światła jest mniejsza
   * niż promień planety.
   */
  const along = x * -0.42 + y * -0.42 + z * 0.82;
  const perp2 = x * x + y * y + z * z - along * along;
  const shadow = along < 0 && perp2 < 1 ? 0.22 : 1;

  const g = light * shadow;
  const nr = rings.rgba[i] * g;
  const ng = rings.rgba[i + 1] * g;
  const nb = rings.rgba[i + 2] * g;

  const back = out[o + 3] / 255;
  const outA = alpha + back * (1 - alpha);
  if (outA <= 0) {
    out[o + 3] = 0;
    return;
  }
  out[o] = (nr * alpha + out[o] * back * (1 - alpha)) / outA;
  out[o + 1] = (ng * alpha + out[o + 1] * back * (1 - alpha)) / outA;
  out[o + 2] = (nb * alpha + out[o + 2] * back * (1 - alpha)) / outA;
  out[o + 3] = outA * 255;
}

export function PlanetGlobe({
  body,
  size = 200,
  illumination,
  waxing = true,
  locked = false,
  still = false,
}: PlanetGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<PlanetAtlas | null>(null);
  const [rings, setRings] = useState<RingProfile | null>(null);
  const [dragging, setDragging] = useState(false);

  /* Kąty obrotu poza stanem Reacta: zmieniają się w każdej klatce. */
  const angles = useRef({ lon: 0, lat: 0.18 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /* Rysowanie wywoływane wprost, poza pętlą klatek. Dzięki temu przeciąganie odpowiada
   * natychmiast, a nie dopiero w następnej klatce, i działa też wtedy, gdy przeglądarka
   * wstrzymała pętlę, na przykład w karcie w tle. */
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPlanetAtlas().then((loaded) => {
      if (!cancelled) setAtlas(loaded);
    });
    /* Profil pierścieni pobieramy tylko dla Saturna, bo tylko on ma je na tyle
     * jasne, żeby dało się je zobaczyć przez amatorski teleskop. Pozostałe planety
     * olbrzymy również mają pierścienie, ale są ciemne i wąskie, a narysowane
     * tak samo wyraźnie jak Saturnowe kłamałyby o tym, co widać. */
    if (body === 'saturn') {
      void loadRingProfile().then((loaded) => {
        if (!cancelled) setRings(loaded);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [body]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !atlas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const index = atlas.manifest.bodies.indexOf(body);
    if (index < 0) return;

    const { columns, cellWidth, cellHeight } = atlas.manifest;
    const cellX = (index % columns) * cellWidth;
    const cellY = Math.floor(index / columns) * cellHeight;
    const atlasW = atlas.width;
    const src = atlas.data;

    const tilt = ((AXIAL_TILT[body] ?? 0) * Math.PI) / 180;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    const spin = ((SPIN[body] ?? 6) * Math.PI) / 180;

    const image = ctx.createImageData(RESOLUTION, RESOLUTION);
    const out = image.data;
    const r = RESOLUTION / 2;

    /*
     * Ile promieni planety mieści się w połowie kadru.
     *
     * Dla kuli bez pierścieni jest to dokładnie jeden: tarcza wypełnia kadr.
     * Saturn potrzebuje więcej, bo zewnętrzna krawędź pierścienia A leży w odległości
     * 2,35 promienia planety od jej środka. Przy kadrze dopasowanym do samej kuli
     * pierścienie byłyby obcięte tuż za jej brzegiem, czyli w miejscu, w którym
     * dopiero się zaczynają.
     */
    const viewRadius = rings ? rings.outerRadius + 0.09 : 1;
    /* Rozmiar piksela ekranu we współrzędnych świata. Potrzebny do wygładzenia brzegu. */
    const pixelWorld = viewRadius / r;

    /*
     * Kierunek do Słońca, liczony z ułamka oświetlenia.
     *
     * Ułamek k wiąże się z kątem fazowym zależnością k = (1 + cos g) / 2, więc
     * g = arccos(2k - 1). Przy pełni g wynosi zero i światło pada od strony obserwatora,
     * przy kwadrze dziewięćdziesiąt stopni i pada z boku, przy nowiu sto osiemdziesiąt
     * i pada zza obiektu. Znak przy składowej poziomej rozstrzyga, czy oświetlony rąbek
     * jest po prawej, czy po lewej: na półkuli północnej przybywający Księżyc świeci
     * prawą stroną.
     */
    const phase =
      illumination === undefined
        ? null
        : (() => {
            const g = Math.acos(Math.max(-1, Math.min(1, 2 * illumination - 1)));
            return { x: (waxing ? 1 : -1) * Math.sin(g), z: Math.cos(g) };
          })();

    let frame = 0;
    let last = performance.now();

    const paint = () => {
      const lonOffset = angles.current.lon;
      const latOffset = angles.current.lat;
      const cosLat = Math.cos(latOffset);
      const sinLat = Math.sin(latOffset);

      /*
       * Kąt między osią planety a pionem ekranu. Obrót wokół osi poziomej i nachylenie
       * osi planety składają się w jeden obrót, bo oba są obrotami wokół tej samej osi.
       * Płaszczyzna równika, a więc i płaszczyzna pierścieni, jest do tej osi prostopadła.
       */
      const axisAngle = latOffset + tilt;
      const sinAxis = Math.sin(axisAngle);
      const cosAxis = Math.cos(axisAngle);

      /*
       * Oświetlenie pierścieni.
       *
       * Pierścień jest cienkim dyskiem, więc jego normalna to oś planety, a nie
       * kierunek od środka kuli, którym oświetlamy powierzchnię. Przy ustawieniu
       * pierścieni krawędzią do Słońca praktycznie znikają, i tak też jest naprawdę:
       * co piętnaście lat Saturn pokazuje Ziemi pierścienie z boku i przestają
       * być widoczne nawet w dużych teleskopach.
       */
      const ringLight = rings
        ? 0.42 + 0.58 * Math.abs(cosAxis * -0.42 + -sinAxis * 0.82)
        : 0;

      for (let py = 0; py < RESOLUTION; py++) {
        const y = ((py + 0.5 - r) / r) * viewRadius;
        for (let px = 0; px < RESOLUTION; px++) {
          const x = ((px + 0.5 - r) / r) * viewRadius;
          const d2 = x * x + y * y;
          const o = (py * RESOLUTION + px) * 4;

          /*
           * Pierścienie. Rzut prostokątny sprawia, że promień biegnący przez piksel
           * ma stałe x i y, a zmienia się tylko z. Punkt przecięcia z płaszczyzną
           * równika wyliczamy wprost, bez szukania: z płaszczyzny wynika z = y ctg A,
           * a promień w tej płaszczyźnie to pierwiastek z x kwadrat plus y przez sin A,
           * podniesione do kwadratu. Stąd okrąg pierścienia rzutuje się na elipsę
           * o półosi mniejszej równej sinusowi kąta nachylenia, dokładnie tak,
           * jak widać go przez teleskop.
           */
          let ringR = 0;
          let ringZ = 0;
          let ringCover = 0;
          if (rings && Math.abs(sinAxis) > 0.02) {
            const planetZ = y / sinAxis;
            ringR = Math.sqrt(x * x + planetZ * planetZ);
            /*
             * Wygładzenie krawędzi. Test "promień mieści się w zakresie" daje
             * odpowiedź tak albo nie, a elipsa pierścienia przecina siatkę pikseli
             * pod dowolnym kątem, więc jej brzeg wychodził schodkowy. Zamiast tego
             * liczymy, jaka część piksela leży wewnątrz pierścienia. Szerokość
             * przejścia to rozmiar piksela przeliczony na promień w płaszczyźnie
             * pierścieni, czyli podzielony przez sinus nachylenia: przy pierścieniach
             * ustawionych prawie krawędzią jeden piksel obejmuje wiele promieni naraz.
             */
            const feather = Math.max(pixelWorld, pixelWorld / Math.abs(sinAxis));
            const odWewnatrz = (ringR - rings.innerRadius) / feather;
            const odZewnatrz = (rings.outerRadius - ringR) / feather;
            ringCover =
              Math.max(0, Math.min(1, odWewnatrz)) * Math.max(0, Math.min(1, odZewnatrz));
            if (ringCover > 0.002) {
              ringZ = (y * cosAxis) / sinAxis;
            } else {
              ringCover = 0;
            }
          }

          if (d2 >= 1) {
            /* Poza tarczą planety widać wyłącznie pierścienie. */
            if (ringCover > 0) {
              writeRing(out, o, rings!, ringR, ringLight, x, y, ringZ, ringCover);
            } else {
              out[o + 3] = 0;
            }
            continue;
          }

          const z = Math.sqrt(1 - d2);

          /* Obrót wokół osi poziomej, czyli podniesienie i opuszczenie bieguna. */
          const ty0 = y * cosLat - z * sinLat;
          const tz0 = y * sinLat + z * cosLat;

          /* Nachylenie osi planety. */
          const ry = ty0 * cosTilt - tz0 * sinTilt;
          const rz = ty0 * sinTilt + tz0 * cosTilt;

          const lat = Math.asin(Math.max(-1, Math.min(1, -ry)));
          const lon = Math.atan2(x, rz) + lonOffset;

          let tu = 0.5 + lon / (2 * Math.PI);
          tu -= Math.floor(tu);
          const tv = Math.max(0, Math.min(0.999, 0.5 - lat / Math.PI));

          /*
           * Próbkowanie dwuliniowe.
           *
           * Wcześniej barwę brał najbliższy piksel mapy i przy Słońcu było to widać
           * od razu: granulacja fotosfery to drobny, wysokokontrastowy wzór, więc
           * zaokrąglanie współrzędnej do całego piksela zamieniało ją w kwadraty.
           * Na planetach z gładkimi pasami wada była mniej widoczna, ale występowała
           * tak samo, zwłaszcza przy brzegu tarczy, gdzie jeden piksel ekranu
           * obejmuje kilkanaście stopni długości geograficznej.
           */
          const fx = tu * cellWidth - 0.5;
          const fy = tv * cellHeight - 0.5;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const wx = fx - x0;
          const wy = fy - y0;
          /* Długość geograficzna zawija się na obwodzie, szerokość zatrzymuje na biegunie. */
          const xa = cellX + ((x0 % cellWidth) + cellWidth) % cellWidth;
          const xb = cellX + ((x0 + 1) % cellWidth + cellWidth) % cellWidth;
          const ya = cellY + Math.max(0, Math.min(cellHeight - 1, y0));
          const yb = cellY + Math.max(0, Math.min(cellHeight - 1, y0 + 1));
          const iaa = (ya * atlasW + xa) * 4;
          const iba = (ya * atlasW + xb) * 4;
          const iab = (yb * atlasW + xa) * 4;
          const ibb = (yb * atlasW + xb) * 4;
          const w00 = (1 - wx) * (1 - wy);
          const w10 = wx * (1 - wy);
          const w01 = (1 - wx) * wy;
          const w11 = wx * wy;

          /*
           * Oświetlenie. Bez podanej fazy pada umownie z lewej góry, jak w typowym
           * zdjęciu obiektu: kula w pełni oświetlona wyglądałaby płasko, a sierp
           * chowałby połowę mapy powierzchni. Z podaną fazą kierunek światła wynika
           * z rzeczywistego kąta fazowego, więc widać dokładnie ten sierp albo garb,
           * który jest teraz na niebie.
           */
          const light = phase
            ? Math.max(0, x * phase.x + z * phase.z)
            : Math.max(0, -x * 0.42 - y * 0.42 + z * 0.82);
          /* Przy odwzorowaniu fazy ciemna strona nie jest zupełnie czarna, bo świeci
           * światłem odbitym od Ziemi. Zjawisko widać gołym okiem przy wąskim sierpie. */
          const shade = phase
            ? 0.05 + 0.95 * Math.pow(light, 0.7)
            : 0.24 + 0.86 * Math.pow(light, 0.62);
          const edge = Math.min(1, (1 - Math.sqrt(d2)) / pixelWorld);

          out[o] = Math.min(
            255,
            (src[iaa] * w00 + src[iba] * w10 + src[iab] * w01 + src[ibb] * w11) * shade,
          );
          out[o + 1] = Math.min(
            255,
            (src[iaa + 1] * w00 + src[iba + 1] * w10 + src[iab + 1] * w01 + src[ibb + 1] * w11) *
              shade,
          );
          out[o + 2] = Math.min(
            255,
            (src[iaa + 2] * w00 + src[iba + 2] * w10 + src[iab + 2] * w01 + src[ibb + 2] * w11) *
              shade,
          );
          out[o + 3] = 255 * edge;

          /* Pierścień przechodzący przed tarczą zasłania ją. Ten za tarczą nie. */
          if (ringCover > 0 && ringZ > z) {
            writeRing(out, o, rings!, ringR, ringLight, x, y, ringZ, edge * ringCover);
          }
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    drawRef.current = paint;
    paint();

    if (still) return;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const delta = Math.min(120, now - last);
      if (delta < FRAME_MS) return;
      last = now;
      /* Samoczynny obrót tylko wtedy, gdy nikt nie trzyma globusa palcem. */
      if (drag.current || locked) return;
      /*
       * Znak jest odejmowany, i to nie przez pomyłkę.
       *
       * W tym odwzorowaniu długość geograficzna rośnie w prawo, tak jak na każdej mapie
       * w odwzorowaniu walcowym, czyli wschód jest po prawej stronie tarczy. Zmierzone:
       * przy rosnącym przesunięciu długości wybrany punkt powierzchni wędruje po ekranie
       * w lewo. Obrót prosty planety, czyli ku wschodowi, ma wyglądać odwrotnie:
       * szczegóły mają sunąć w prawo i znikać za prawym brzegiem.
       */
      angles.current.lon -= (spin * delta) / 1000;
      paint();
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      drawRef.current = null;
    };
  }, [atlas, rings, body, illumination, waxing, locked, still, size]);

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    przechwycWskaznik(event.target as HTMLElement, event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    /* Przeciągnięcie o szerokość globusa obraca go o mniej więcej pół obrotu. */
    angles.current.lon -= ((event.clientX - d.x) / size) * Math.PI;
    angles.current.lat = Math.max(
      -1.2,
      Math.min(1.2, angles.current.lat + ((event.clientY - d.y) / size) * Math.PI * 0.6),
    );
    d.x = event.clientX;
    d.y = event.clientY;
    drawRef.current?.();
  };

  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };

  if (!atlas) {
    return <div className={styles.placeholder} style={{ width: size, height: size }} aria-hidden="true" />;
  }

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={RESOLUTION}
        height={RESOLUTION}
        className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''} ${still ? styles.canvasStill : ''}`}
        style={{ width: size, height: size }}
        onPointerDown={still ? undefined : onDown}
        onPointerMove={still ? undefined : onMove}
        onPointerUp={still ? undefined : onUp}
        onPointerCancel={still ? undefined : onUp}
        role="img"
        aria-label={
          still
            ? 'Model powierzchni obiektu.'
            : 'Model powierzchni obiektu. Przeciągnij, żeby go obrócić.'
        }
      />
    </div>
  );
}
