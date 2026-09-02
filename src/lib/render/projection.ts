/*
 * Projekcja stereograficzna sfery niebieskiej na płaszczyznę ekranu.
 *
 * Wybrana świadomie, bo zachowuje kąty i odwzorowuje okręgi na sferze w okręgi na płaszczyźnie.
 * Dzięki temu kształty gwiazdozbiorów nie są zniekształcane, a linia horyzontu pozostaje
 * gładkim łukiem nawet przy szerokim polu widzenia.
 *
 * Układ wejściowy jest zgodny z konwencją silnika efemeryd: x to północ, y to zachód, z to zenit.
 */

const D2R = Math.PI / 180;

/*
 * Największy dopuszczalny kąt widzenia w poziomie, w stopniach.
 *
 * Sto dwadzieścia to w przybliżeniu tyle, ile obejmuje ludzkie pole widzenia obuoczne
 * bez obracania głowy. Powyżej tej wartości obraz przestaje odpowiadać czemukolwiek,
 * co da się zobaczyć naraz, i zaczyna wyglądać jak zdjęcie z obiektywu rybie oko.
 */
const FOV_HORIZONTAL_MAX = 120;
const R2D = 180 / Math.PI;

export interface ProjectedPoint {
  x: number;
  y: number;
  /** Iloczyn skalarny z kierunkiem patrzenia. Wartości ujemne oznaczają obiekt za plecami. */
  depth: number;
}

export class SkyProjection {
  /* Kierunek patrzenia. */
  azimuth = 0;
  altitude = 20;
  /** Pionowe pole widzenia w stopniach. */
  fov = 100;

  /* Wymiary obszaru rysowania w pikselach urządzenia. */
  width = 0;
  height = 0;
  cx = 0;
  cy = 0;
  scale = 1;

  /* Baza kamery w układzie horyzontalnym, rozbita na składowe dla szybkiej pętli. */
  fn = 1;
  fw = 0;
  fu = 0;
  rn = 0;
  rw = -1;
  ru = 0;
  un = 0;
  uw = 0;
  uu = 1;

  /** Maksymalny promień na ekranie, poza którym nie ma sensu rysować. */
  maxRadius = 0;

  update(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;

    const alt = this.altitude * D2R;
    const az = this.azimuth * D2R;
    const cosAlt = Math.cos(alt);
    const sinAlt = Math.sin(alt);
    const cosAz = Math.cos(az);
    const sinAz = Math.sin(az);

    /* Kierunek patrzenia. */
    this.fn = cosAlt * cosAz;
    this.fw = -cosAlt * sinAz;
    this.fu = sinAlt;

    /* Kierunek w prawo, czyli w stronę rosnącego azymutu. */
    this.rn = -sinAz;
    this.rw = -cosAz;
    this.ru = 0;

    /* Kierunek w górę, czyli w stronę rosnącej wysokości. */
    this.un = -sinAlt * cosAz;
    this.uw = sinAlt * sinAz;
    this.uu = cosAlt;

    /*
     * Skala: kąt równy połowie pola widzenia ma trafić na połowę wysokości obszaru.
     */
    const half = Math.min(this.fov, 179) * 0.5 * D2R;
    const zPionu = this.cy / (2 * Math.tan(half / 2));

    /*
     * OGRANICZENIE POLA WIDZENIA W POZIOMIE
     *
     * Pole widzenia jest zadane w pionie, więc na szerokim ekranie w poziomie
     * obejmuje tyle, ile wynika z proporcji okna. Na monitorze o proporcji dwa do
     * jednego przy stu dziesięciu stopniach w pionie wychodziło ponad sto
     * pięćdziesiąt w poziomie, a horyzont, który w rzucie stereograficznym jest
     * okręgiem, przy tak szerokim wycinku zaginał się przez cały ekran.
     *
     * Nie jest to błąd rzutu: patrząc na sto pięćdziesiąt stopni azymutu naraz
     * horyzont naprawdę otacza obserwatora i musi się zakrzywić. Rzecz w tym,
     * że nikt tak nie patrzy. Człowiek obejmuje wzrokiem około stu dwudziestu
     * stopni i przy takim wycinku horyzont jest już łagodnym łukiem.
     *
     * Dlatego skalę bierzemy większą z dwóch: tej z pola pionowego i tej, która
     * utrzymuje pole poziome w granicach stu dwudziestu stopni. Na telefonie
     * trzymanym pionowo drugi warunek nigdy nie działa, bo kadr jest wąski.
     * Na szerokim ekranie to on rozstrzyga i obraz jest wtedy bliższy temu,
     * co widać, stojąc na dworze.
     */
    const polowaPoziomu = FOV_HORIZONTAL_MAX * 0.5 * D2R;
    const zPoziomu = this.cx / (2 * Math.tan(polowaPoziomu / 2));

    this.scale = Math.max(zPionu, zPoziomu);
    this.maxRadius = Math.hypot(this.cx, this.cy) * 1.15;
  }

  /** Rzutuje wektor horyzontalny na współrzędne ekranu. */
  project(n: number, w: number, u: number, out: ProjectedPoint): boolean {
    const depth = n * this.fn + w * this.fw + u * this.fu;
    out.depth = depth;
    /* Punkt antypodyczny nie ma obrazu, a jego okolica rozciąga się w nieskończoność. */
    if (depth <= -0.995) return false;
    const k = (2 / (1 + depth)) * this.scale;
    const px = (n * this.rn + w * this.rw + u * this.ru) * k;
    const py = (n * this.un + w * this.uw + u * this.uu) * k;
    out.x = this.cx + px;
    out.y = this.cy - py;
    return true;
  }

  /** Odwraca projekcję: z punktu na ekranie odczytuje kierunek na sferze. */
  unproject(sx: number, sy: number): { n: number; w: number; u: number } {
    const px = (sx - this.cx) / this.scale;
    const py = (this.cy - sy) / this.scale;
    const r = Math.hypot(px, py);
    if (r < 1e-9) return { n: this.fn, w: this.fw, u: this.fu };
    const theta = 2 * Math.atan(r / 2);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const ux = px / r;
    const uy = py / r;
    return {
      n: cos * this.fn + sin * (ux * this.rn + uy * this.un),
      w: cos * this.fw + sin * (ux * this.rw + uy * this.uw),
      u: cos * this.fu + sin * (ux * this.ru + uy * this.uu),
    };
  }

  /** Ile pikseli przypada na stopień w środku pola widzenia. */
  pixelsPerDegree(): number {
    return (this.scale * 2 * Math.tan(0.5 * D2R)) / 1;
  }

  /** Kąt widzenia odpowiadający zadanej liczbie pikseli w środku obrazu. */
  degreesPerPixel(): number {
    return (2 * Math.atan(1 / (2 * this.scale)) * R2D) / 1;
  }
}

/*
 * Ograniczenie kierunku patrzenia w pionie.
 *
 * Bez tego dawało się patrzeć w dół i połowa albo więcej ekranu robiła się gruntem.
 * Geometrycznie było to poprawne, bo patrząc poziomo faktycznie ma się pod nogami
 * połowę pola widzenia, ale w mapie nieba jest to strata: użytkownik przyszedł
 * po niebo, a nie po ziemię.
 *
 * Zasada: dolna krawędź kadru nie schodzi niżej niż trzydzieści stopni pod horyzont.
 * Wynika z niej, że przy szerokim polu widzenia trzeba patrzeć wysoko, a przy wąskim
 * wolno zejść aż do horyzontu i poniżej. To dokładnie odwzorowuje sens obu sytuacji:
 * przy szerokim kadrze chodzi o ogląd całego nieba, przy wąskim o konkretny obiekt
 * nisko nad horyzontem, na przykład planetę tuż po wschodzie.
 *
 * Trzydzieści stopni to niecała jedna trzecia kadru przy pełnym polu widzenia.
 * Wcześniej było osiemnaście i grunt schodził do jednej piątej, przez co teren
 * robił się paskiem na dole zamiast planem, po którym oko może wejść w głąb obrazu.
 * Głębia bierze się z nakładania planów, a plany potrzebują miejsca.
 */
const HORIZON_MARGIN = 30;

/*
 * Ograniczenie wysokości kierunku patrzenia.
 *
 * Przy przeglądaniu mapy palcem dolna granica ma sens: bez niej łatwo zjechać tak nisko,
 * że cały kadr wypełnia ziemia, a niebo znika z ekranu. Granica zależy od pola widzenia,
 * bo przy szerokim kadrze horyzont wchodzi w obraz wcześniej.
 *
 * Przy prowadzeniu mapy telefonem ta sama granica jest jednak szkodliwa i trzeba ją zdjąć.
 * Cała rzecz polega tam na tym, że obraz odpowiada temu, gdzie telefon jest skierowany.
 * Skierowanie go na horyzont albo niżej musi więc dawać horyzont albo widok w dół,
 * a nie widok zatrzymany dwadzieścia stopni wyżej. Zatrzymany wyglądałby na zepsuty,
 * bo telefon by się ruszał, a obraz nie.
 */
export const clampAltitude = (alt: number, fov = 100, swobodna = false): number => {
  const min = swobodna ? -90 : Math.min(70, fov / 2 - HORIZON_MARGIN);
  return Math.max(min, Math.min(swobodna ? 90 : 88, alt));
};

/** Sprowadza azymut do zakresu od zera do 360 stopni. */
export const wrapAzimuth = (az: number): number => ((az % 360) + 360) % 360;

export const FOV_MIN = 4;

/*
 * Górna granica pola widzenia.
 *
 * Projekcja stereograficzna wiernie oddaje kształty, ale przy bardzo szerokim kadrze
 * całe niebo zwija się w widoczny na ekranie okrąg otoczony pustką. Geometrycznie
 * jest to poprawne, w odbiorze wygląda na zepsute: użytkownik widzi kulę zawieszoną
 * w ciemności zamiast nieba nad sobą.
 *
 * Sto dziesięć stopni to najszerszy kadr, w którym krawędź horyzontu jest jeszcze
 * łagodnym łukiem, a nie zamkniętym kołem. Powyżej tej wartości zakrzywienie zaczyna
 * dominować nad treścią.
 */
export const FOV_MAX = 110;
export const clampFov = (fov: number): number => Math.max(FOV_MIN, Math.min(FOV_MAX, fov));
