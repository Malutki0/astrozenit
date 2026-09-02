/*
 * Zarys terenu na horyzoncie.
 *
 * DLACZEGO WARSTWY, A NIE JEDNA SYLWETKA
 *
 * Pojedyncza linia terenu na czarnym tle daje płaski obraz: oko nie ma z czego
 * odczytać odległości, więc czyta dolną część ekranu jako ścianę, a nie jako
 * przestrzeń ciągnącą się do horyzontu. Wrażenie głębi bierze się z dwóch rzeczy,
 * które w naturze zawsze występują razem.
 *
 * Pierwsza to nakładanie się planów. Bliższe wzniesienie zasłania dalsze, i już samo
 * to mówi oku, co jest przed czym. Dlatego rysujemy jedenaście profili, jeden za drugim,
 * od najdalszego do najbliższego, rozłożonych na całej wysokości gruntu.
 *
 * Druga to perspektywa powietrzna. Im dalej patrzymy, tym grubszą warstwę powietrza
 * mamy po drodze, więc daleki grzbiet jest jaśniejszy i bardziej niebieski od bliskiego,
 * mimo że oba są tym samym ciemnym lasem. Malarze nazywają to sfumato i stosują od
 * pięciuset lat; tutaj jest to po prostu mieszanie barwy terenu z barwą przy horyzoncie
 * w proporcji zależnej od odległości planu.
 *
 * Dalsze plany są wyższe od bliższych, bo tak wygląda krajobraz z pagórkami przed
 * górami: to, co daleko, wystaje ponad to, co blisko. Ostatnie profile schodzą
 * poniżej matematycznego horyzontu i dają ziemię pod nogami obserwatora.
 *
 * KSZTAŁT PROFILU
 *
 * Każdy profil to suma sinusoid o całkowitej liczbie okresów na pełnym obrocie,
 * dzięki czemu domyka się na azymucie 360 bez widocznego szwu. Kształt nie zależy
 * od miejsca obserwacji, bo aplikacja nie ma modelu wysokościowego. To ozdoba,
 * a nie odwzorowanie okolicy, dlatego profile są łagodne i pozbawione cech
 * charakterystycznych, których ktoś mógłby szukać w terenie.
 *
 * WYSOKOŚCI
 *
 * Najwyższy punkt najdalszego grzbietu leży poniżej ośmiu stopni nad horyzontem.
 * Tyle zabierają realnemu obserwatorowi dalekie wzgórza, a jednocześnie na tej
 * wysokości ekstynkcja atmosferyczna odbiera obiektowi blisko wielkość gwiazdową,
 * więc nie chowamy niczego, co dałoby się sensownie obserwować.
 */

const D2R = Math.PI / 180;

interface Wave {
  /** Liczba pełnych okresów na obrocie o 360 stopni. Całkowita, żeby profil się domykał. */
  cycles: number;
  amplitude: number;
  phase: number;
}

export interface Ridge {
  /** Zero dla planu najdalszego, jeden dla ziemi pod nogami. Steruje barwą i mgłą. */
  distance: number;
  base: number;
  waves: Wave[];
}

/*
 * Jedenaście planów rozłożonych od siedmiu stopni nad horyzontem do czternastu pod nim.
 *
 * Liczba planów jest tu ważniejsza niż ich wysokość. Pierwsza wersja miała sześć
 * planów, z czego cztery mieściły się w pasku o wysokości pięciu procent kadru,
 * a całą resztę gruntu zajmowały dwie płaskie płachty. Wyglądało to jak schodek,
 * nie jak przestrzeń. Głębia bierze się z liczby kolejnych zasłonięć, jakie oko
 * napotyka, wędrując w dół obrazu, więc plany muszą pokrywać cały grunt, także ten
 * pod nogami, a nie tylko okolicę horyzontu.
 *
 * Odstępy między planami maleją wraz z odległością, dokładnie tak, jak w perspektywie:
 * dwa wzgórza oddalone od siebie o kilometr dzieli na niebie tym mniejszy kąt,
 * im dalej od obserwatora leżą. Plany bliskie mają za to większy relief, bo bliski
 * pagórek zajmuje na niebie więcej stopni niż daleka góra tej samej wysokości.
 *
 * Amplitudy są dobrane tak, żeby porządek planów zachował się w około dziewięćdziesięciu
 * procentach azymutów. Pozostałe dziesięć to miejsca, w których bliższy grzbiet wystaje
 * ponad dalszy, i tego nie poprawiamy: tak wygląda prawdziwy krajobraz, a rysowanie
 * planów od najdalszego do najbliższego załatwia zasłanianie samo z siebie.
 */
interface Spec {
  distance: number;
  base: number;
  /** Skala reliefu. Jedynka to około jednego stopnia od grzbietu do doliny. */
  relief: number;
  /** Przesunięcie fazy, różne dla każdego planu, żeby profile się nie zestrajały. */
  seed: number;
}

const SPECS: Spec[] = [
  { distance: 0, base: 8.2, relief: 2, seed: 0.6 },
  { distance: 0.1, base: 6.3, relief: 2, seed: 2.9 },
  { distance: 0.2, base: 4.7, relief: 1.8, seed: 5.1 },
  { distance: 0.3, base: 3.3, relief: 1.7, seed: 1.4 },
  { distance: 0.4, base: 2, relief: 1.5, seed: 3.8 },
  { distance: 0.5, base: 0.8, relief: 1.5, seed: 0.2 },
  { distance: 0.6, base: -0.8, relief: 1.9, seed: 4.6 },
  { distance: 0.7, base: -3.2, relief: 2.6, seed: 2.2 },
  { distance: 0.8, base: -6.8, relief: 3.6, seed: 5.7 },
  { distance: 0.9, base: -11.8, relief: 4.6, seed: 1.9 },
  { distance: 1, base: -18.5, relief: 5.6, seed: 3.4 },
];

/*
 * Harmoniczne wspólne dla wszystkich planów. Liczba okresów jest całkowita, więc
 * profil domyka się na azymucie 360 bez widocznego szwu.
 *
 * Ciężar leży na harmonicznych od pięciu do dwudziestu jeden okresów, i to jest tu
 * rzecz najważniejsza. Pierwsza wersja opierała się na dwóch i trzech okresach na
 * pełnym obrocie, co brzmi rozsądnie, ale w kadrze widać naraz około pięćdziesięciu
 * stopni azymutu, czyli jedną siódmą obrotu. Fala o dwóch okresach daje na tym
 * wycinku ćwierć okresu, więc nie wzgórze, tylko delikatne pochylenie, i cały teren
 * czytał się jako poziome paski.
 *
 * Osiem okresów na obrocie to nieco ponad jedno wzniesienie na kadr, trzynaście
 * to dwa, dwadzieścia jeden to trzy. Dopiero taki rozkład daje sylwetkę, po której
 * oko rozpoznaje krajobraz.
 */
const HARMONICS: { cycles: number; weight: number; offset: number }[] = [
  { cycles: 3, weight: 0.14, offset: 0 },
  { cycles: 5, weight: 0.2, offset: 1.7 },
  { cycles: 8, weight: 0.22, offset: 3.4 },
  { cycles: 13, weight: 0.16, offset: 5.1 },
  { cycles: 21, weight: 0.1, offset: 2.3 },
  { cycles: 34, weight: 0.05, offset: 4.2 },
];

export const RIDGES: Ridge[] = SPECS.map((spec) => ({
  distance: spec.distance,
  base: spec.base,
  waves: HARMONICS.map((h) => ({
    cycles: h.cycles,
    amplitude: h.weight * spec.relief,
    phase: h.offset + spec.seed * (h.cycles * 0.37 + 1),
  })),
}));

/** Wysokość kątowa danego planu dla zadanego azymutu, w stopniach. */
export function ridgeAltitude(ridge: Ridge, azimuthDeg: number): number {
  const a = azimuthDeg * D2R;
  let h = ridge.base;
  for (const w of ridge.waves) h += w.amplitude * Math.sin(w.cycles * a + w.phase);
  return h;
}

/**
 * Widoczna krawędź terenu dla danego azymutu, czyli najwyższy z planów.
 * To na niej, a nie na wysokości zero, stawiamy podpisy kierunków świata,
 * bo obserwator widzi linię styku nieba z ziemią, a nie poziom swoich oczu.
 */
export function terrainAltitude(azimuthDeg: number): number {
  let max = 0;
  for (const ridge of RIDGES) {
    if (ridge.base < 0) continue;
    const h = ridgeAltitude(ridge, azimuthDeg);
    if (h > max) max = h;
  }
  return Math.max(0.1, max);
}

/** Najwyższy punkt całego profilu, potrzebny do decyzji, czy w ogóle warto go rysować. */
export const TERRAIN_MAX = (() => {
  let max = 0;
  for (let az = 0; az < 360; az += 0.5) max = Math.max(max, terrainAltitude(az));
  return max;
})();
