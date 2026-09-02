/*
 * Aktualności astronomiczne.
 *
 * Wpisy są przechowywane w pamięci przeglądarki, bo AstroZenit nie ma zaplecza serwerowego.
 * Panel redakcyjny pozwala je dodawać, poprawiać i usuwać, a całość da się wyeksportować
 * do pliku JSON. Dzięki temu przeniesienie treści do prawdziwego systemu zarządzania
 * treścią sprowadza się do wczytania jednego pliku, a nie do przepisywania wszystkiego.
 *
 * Wpisy dołączone razem z aplikacją opisują rzeczy powszechnie znane i sprawdzalne,
 * żeby po pierwszym uruchomieniu strona nie była pusta.
 */

export type NewsCategory = 'misja' | 'odkrycie' | 'teleskop' | 'wydarzenie' | 'sprzet';

export interface NewsPost {
  id: string;
  title: string;
  /** Zajawka pokazywana na liście. Jedno albo dwa zdania. */
  lead: string;
  /** Treść wpisu. Akapity rozdzielone pustym wierszem. */
  body: string;
  /** Data publikacji w zapisie ISO. */
  date: string;
  category: NewsCategory;
  /** Odnośnik do źródła, opcjonalny. */
  source?: string;
  /** Identyfikator zdjęcia otwierającego wpis, z bazy obrazów. */
  coverId?: string;
  /** Identyfikatory zdjęć wstawionych w treść, w kolejności występowania. */
  imageIds?: string[];
}

export const CATEGORIES: Record<NewsCategory, { label: string; tone: string }> = {
  misja: { label: 'Misja kosmiczna', tone: 'oklch(0.78 0.09 210)' },
  odkrycie: { label: 'Odkrycie', tone: 'oklch(0.82 0.115 78)' },
  teleskop: { label: 'Teleskopy', tone: 'oklch(0.76 0.1 300)' },
  wydarzenie: { label: 'Wydarzenie na niebie', tone: 'oklch(0.75 0.11 45)' },
  sprzet: { label: 'Sprzęt i technika', tone: 'oklch(0.72 0.06 160)' },
};

const STORAGE_KEY = 'zenit:aktualnosci';

/*
 * Ograniczenia długości pól.
 *
 * Nie chodzi o wygodę, tylko o odporność. Bez nich wczytanie spreparowanego pliku
 * albo wklejenie ogromnej treści potrafi zapchać pamięć przeglądarki i unieruchomić
 * aplikację. Przycinamy więc wszystko na wejściu, zamiast ufać, że dane są rozsądne.
 */
const LIMITS = { title: 200, lead: 500, body: 60000, source: 500, id: 80, images: 24 } as const;

/**
 * Sprawdzenie odnośnika.
 *
 * Przepuszczamy wyłącznie schematy http i https. Zapis zaczynający się od javascript
 * albo od data pozwoliłby uruchomić kod po kliknięciu w odnośnik przez czytelnika,
 * i jest to jedyna realna droga wstrzyknięcia kodu w aplikacji bez serwera.
 */
export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, LIMITS.source);
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/* Tekst czyszczony z bajtów sterujących, które nie mają w treści czego szukać
 * i potrafią rozbić układ strony albo zapis do pamięci. */
function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, limit)
    .trim();
}

const isImageId = (value: unknown): value is string =>
  typeof value === 'string' && /^img-[a-z0-9-]{4,60}$/i.test(value);

/*
 * Zestaw początkowy.
 *
 * Opisuje fakty utrwalone i sprawdzalne, bez dat dziennych i bez cytatów.
 */
export const SAMPLE_POSTS: NewsPost[] = [
  {
    id: 'przyklad-jwst',
    title: 'Kosmiczny Teleskop Jamesa Webba patrzy tam, gdzie oko nie sięga',
    lead: 'Zwierciadło o średnicy 6,5 metra, złożone z osiemnastu sześciokątnych segmentów, pracuje w podczerwieni półtora miliona kilometrów od Ziemi.',
    body: `Teleskop wystartował pod koniec 2021 roku na rakiecie Ariane 5 i po miesięcznej podróży zajął miejsce w punkcie Lagrange'a L2 układu Ziemia i Słońce. To jedyne miejsce, w którym Słońce, Ziemia i Księżyc znajdują się zawsze po tej samej stronie, dzięki czemu jedna osłona przeciwsłoneczna wystarcza, żeby utrzymać instrumenty w temperaturze poniżej minus 220 stopni Celsjusza.

Obserwacje w podczerwieni pozwalają zaglądać przez obłoki pyłu, które w świetle widzialnym są nieprzeźroczyste. Stąd zdjęcia obszarów gwiazdotwórczych, na których widać młode gwiazdy zamiast ciemnej plamy.

Z perspektywy obserwatora amatorskiego najciekawsze jest to, że wiele obiektów fotografowanych przez Webba da się odnaleźć na mapie nieba gołym okiem albo przez lornetkę. Mgławica Oriona, oznaczona w katalogu Messiera numerem 42, jest tego najlepszym przykładem.`,
    date: '2026-08-14T09:00:00.000Z',
    category: 'teleskop',
  },
  {
    id: 'przyklad-rubin',
    title: 'Obserwatorium Very Rubin sfotografuje całe niebo co kilka nocy',
    lead: 'Teleskop o średnicy 8,4 metra w chilijskich Andach dostał kamerę o rozdzielczości 3,2 gigapiksela, największą, jaką kiedykolwiek zbudowano do astronomii.',
    body: `Zaplanowany na dziesięć lat przegląd nieba ma rejestrować ten sam fragment sfery niebieskiej wielokrotnie, co pozwala wychwycić wszystko, co się zmienia: supernowe, planetoidy bliskie Ziemi, gwiazdy zmienne i obiekty przelotne, których wcześniej nie sposób było złapać.

Skala jest tu najciekawsza. Pojedyncze zdjęcie obejmuje obszar około czterdziestu razy większy od tarczy Księżyca, a kamera potrzebuje kilkunastu sekund naświetlania. W ciągu jednej nocy powstaje kilkanaście terabajtów danych.

Dla obserwatora oznacza to, że katalogi, z których korzystają programy takie jak ten, będą w najbliższych latach rosnąć szybciej niż kiedykolwiek.`,
    date: '2026-08-02T09:00:00.000Z',
    category: 'teleskop',
  },
  {
    id: 'przyklad-gaia',
    title: 'Gaia zmierzyła położenia niemal dwóch miliardów gwiazd',
    lead: 'Europejska sonda przez ponad dekadę wyznaczała paralaksy, ruchy własne i jasności gwiazd Drogi Mlecznej z dokładnością nieosiągalną z powierzchni Ziemi.',
    body: `Zasada pomiaru jest ta sama, której użył Friedrich Bessel w 1838 roku przy pierwszym udanym pomiarze odległości do gwiazdy: obserwujemy ten sam obiekt z dwóch końców orbity Ziemi i mierzymy, o ile przesunął się względem tła. Różnica jest w precyzji. Gaia potrafiła zmierzyć kąt odpowiadający grubości ludzkiego włosa oglądanego z odległości tysiąca kilometrów.

Efektem jest trójwymiarowa mapa naszej galaktyki, z której wynikają rzeczy zupełnie nieoczywiste: Droga Mleczna ma zakrzywiony i falujący dysk, a w jej historii widać ślady zderzenia z inną galaktyką sprzed dziesięciu miliardów lat.

Odległości gwiazd pokazywane w tej aplikacji, w panelu każdego obiektu, pochodzą pośrednio właśnie z tego rodzaju pomiarów.`,
    date: '2026-07-21T09:00:00.000Z',
    category: 'odkrycie',
  },
  {
    id: 'przyklad-juice',
    title: 'JUICE leci do lodowych księżyców Jowisza',
    lead: 'Europejska sonda wystartowała w 2023 roku i po serii asyst grawitacyjnych dotrze do układu Jowisza w połowie lat trzydziestych.',
    body: `Celem są trzy z czterech księżyców galileuszowych: Ganimedes, Kallisto i Europa. Pod ich lodowymi skorupami prawdopodobnie kryją się oceany ciekłej wody, w przypadku Ganimedesa zawierające więcej wody niż wszystkie oceany Ziemi razem wzięte.

Ganimedes jest przy tym jedynym znanym księżycem z własnym polem magnetycznym, co czyni go obiektem bez odpowiednika w Układzie Słonecznym. Sonda ma jako pierwsza wejść na orbitę wokół księżyca innej planety.

Te same cztery księżyce, które są celem misji, widać przez zwykłą lornetkę. W tej aplikacji pojawiają się przy Jowiszu po przybliżeniu mapy.`,
    date: '2026-06-30T09:00:00.000Z',
    category: 'misja',
  },
  {
    id: 'przyklad-perseidy',
    title: 'Jak obserwować rój meteorów bez sprzętu',
    lead: 'Do meteorów nie potrzeba teleskopu ani lornetki. Potrzeba ciemnego nieba, leżaka i cierpliwości.',
    body: `Teleskop ma wąskie pole widzenia, a meteory pojawiają się nieprzewidywalnie w dowolnym miejscu nieba. Jedynym rozsądnym narzędziem jest własne oko, które obejmuje kilkadziesiąt stopni naraz.

Trzy rzeczy robią największą różnicę. Po pierwsze ciemność: różnica między miastem a wsią to nie kilka procent, tylko kilkakrotnie więcej dostrzeżonych zjawisk. Po drugie adaptacja wzroku, która zajmuje około dwudziestu minut i którą psuje jedno spojrzenie na telefon. Po trzecie faza Księżyca, bo przy pełni nawet z ciemnego miejsca zobaczy się tylko najjaśniejsze bolidy.

Podana przy każdym roju liczba meteorów na godzinę zakłada idealne warunki i radiant w zenicie. W praktyce należy się spodziewać wyraźnie mniej.`,
    date: '2026-08-09T09:00:00.000Z',
    category: 'wydarzenie',
  },
  {
    id: 'przyklad-lornetka',
    title: 'Pierwszy sprzęt: lornetka, nie teleskop',
    lead: 'Najczęstszy błąd początkującego to kupno taniego teleskopu na chwiejnym statywie. Lornetka 10x50 pokaże więcej i nie zniechęci.',
    body: `Oznaczenie 10x50 znaczy dziesięciokrotne powiększenie i pięćdziesiąt milimetrów średnicy obiektywu. Ta druga liczba jest ważniejsza, bo decyduje, ile światła trafia do oka. Lornetka o takich parametrach pokazuje księżyce Jowisza, gromadę w Herkulesie, Galaktykę Andromedy i kratery na Księżycu.

Powiększenie powyżej dziesięciu razy wymaga już statywu, bo drżenie rąk niweczy zysk. Dlatego lornetki 20x80 są świetne, ale wyłącznie na statywie.

Dobrym pierwszym celem jest Księżyc dwa albo trzy dni po pierwszej kwadrze. Wzdłuż granicy światła i cienia cienie są najdłuższe, a kratery widać najwyraźniej. W pełni tarcza jest oświetlona na wprost i wygląda płasko.`,
    date: '2026-07-11T09:00:00.000Z',
    category: 'sprzet',
  },
];

interface StoredNews {
  version: 1;
  posts: NewsPost[];
}

function read(): NewsPost[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredNews;
    return Array.isArray(parsed.posts) ? parsed.posts : null;
  } catch {
    return null;
  }
}

function write(posts: NewsPost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, posts } satisfies StoredNews));
  } catch {
    /* Brak dostępu do pamięci nie może przewrócić aplikacji. Wpisy pozostaną
     * wtedy tylko w bieżącej sesji. */
  }
}

/** Wpisy posortowane od najnowszego. Przy pierwszym uruchomieniu zwraca zestaw przykładowy. */
export function loadPosts(): NewsPost[] {
  const stored = read() ?? SAMPLE_POSTS;
  return [...stored].sort((a, b) => b.date.localeCompare(a.date));
}

export function savePosts(posts: NewsPost[]): NewsPost[] {
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  write(sorted);
  return sorted;
}

/** Zbiera identyfikatory wszystkich obrazów użytych we wpisach. */
export function usedImageIds(posts: NewsPost[]): Set<string> {
  const ids = new Set<string>();
  for (const post of posts) {
    if (post.coverId) ids.add(post.coverId);
    for (const id of post.imageIds ?? []) ids.add(id);
  }
  return ids;
}

/*
 * Budowa wpisu z danych z zewnątrz.
 *
 * Wszystko przechodzi przez czyszczenie i limity, niezależnie od tego, czy pochodzi
 * z formularza, czy z wczytanego pliku. Kategoria spoza listy jest zamieniana na
 * domyślną, data niepoprawna na bieżącą, a odnośnik o niedozwolonym schemacie znika.
 */
export function createPost(partial: Partial<NewsPost>): NewsPost {
  const date = partial.date ? new Date(partial.date) : new Date();
  const category = (partial.category && CATEGORIES[partial.category] ? partial.category : 'misja') as NewsCategory;
  const images = Array.isArray(partial.imageIds)
    ? partial.imageIds.filter(isImageId).slice(0, LIMITS.images)
    : [];

  return {
    id: `wpis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanText(partial.title, LIMITS.title) || 'Bez tytułu',
    lead: cleanText(partial.lead, LIMITS.lead),
    body: cleanText(partial.body, LIMITS.body),
    date: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
    category,
    source: safeUrl(partial.source),
    coverId: isImageId(partial.coverId) ? partial.coverId : undefined,
    imageIds: images.length ? images : undefined,
  };
}

/** Przywraca zestaw początkowy, na przykład po skasowaniu wszystkich wpisów. */
export function restoreSamples(): NewsPost[] {
  return savePosts(SAMPLE_POSTS);
}

/** Eksport do pliku JSON, gotowy do wczytania w innym systemie. */
export function exportPosts(posts: NewsPost[]): string {
  return JSON.stringify({ version: 1, posts }, null, 2);
}

/**
 * Wczytanie wpisów z pliku JSON.
 * Zwraca opis błędu zamiast rzucać wyjątkiem, bo to działanie użytkownika,
 * a nie awaria programu.
 */
export function importPosts(text: string): { posts: NewsPost[] } | { error: string } {
  /* Plik większy niż dziesięć megabajtów to nie jest zbiór wpisów tekstowych. */
  if (text.length > 10 * 1024 * 1024) return { error: 'Plik jest za duży.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'To nie jest poprawny plik JSON.' };
  }

  const container = parsed as { posts?: unknown };
  if (!container || !Array.isArray(container.posts)) {
    return { error: 'Plik nie zawiera listy wpisów.' };
  }
  if (container.posts.length > 2000) return { error: 'Plik zawiera zbyt wiele wpisów.' };

  /* Każdy wpis przechodzi przez tę samą budowę co wpis z formularza, więc obowiązują
   * go te same limity i to samo czyszczenie. Identyfikator przepisujemy tylko wtedy,
   * gdy ma bezpieczny kształt, inaczej nadajemy nowy. */
  const seen = new Set<string>();
  const posts: NewsPost[] = [];
  for (const raw of container.posts) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Partial<NewsPost>;
    if (typeof source.title !== 'string' || !source.title.trim()) continue;
    const post = createPost(source);
    const id =
      typeof source.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(source.id) && !seen.has(source.id)
        ? source.id
        : post.id;
    seen.add(id);
    posts.push({ ...post, id });
  }

  if (posts.length === 0) return { error: 'W pliku nie ma ani jednego poprawnego wpisu.' };
  return { posts };
}

/** Czas czytania w minutach, liczony po dwustu słowach na minutę. */
export function readingTime(post: NewsPost): number {
  const words = `${post.lead} ${post.body}`.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/* ------------------------------------------------------- wpisy z zewnątrz */

/*
 * Wpisy pobrane z cudzych serwisów.
 *
 * Powstają poza aplikacją, w skrypcie scripts/fetch-news.mjs, i leżą w pliku
 * public/data/news.json. Aplikacja tylko je czyta, nigdy nie zmienia, i trzyma je osobno
 * od wpisów własnych. Rozdział jest celowy z dwóch powodów.
 *
 * Po pierwsze, prawa. Do wpisu własnego mamy prawa i możemy go pokazać w całości.
 * Do cudzego mamy tytuł, zajawkę i odnośnik, więc karta ma prowadzić do wydawcy,
 * a nie udawać, że tekst jest nasz.
 *
 * Po drugie, trwałość. Panel redakcyjny zapisuje wpisy w pamięci przeglądarki. Gdyby
 * dopisywał do niej także wpisy pobrane, pamięć rosłaby z każdym pobraniem, a usunięcie
 * wpisu w panelu wracałoby przy następnym odświeżeniu. Pobrane wpisy nie są nigdzie
 * zapisywane: przychodzą z pliku i giną razem z odświeżeniem strony.
 */
export interface FeedPost {
  id: string;
  title: string;
  lead: string;
  date: string;
  category: NewsCategory;
  /** Odnośnik do pełnego tekstu u wydawcy. */
  source: string;
  /** Nazwa serwisu, pokazywana na karcie. */
  sourceLabel: string;
  /** Język zajawki. Wpisy nieprzetłumaczone dostają na karcie znacznik. */
  language: 'pl' | 'en';
  /** Adres zdjęcia, wyłącznie takiego, do którego prawa pozwalają na pokazanie. */
  image?: string;
  /** Podpis pod zdjęciem, gdy źródło wskazuje autora. */
  credit?: string;
  /*
   * Pełna treść, akapity rozdzielone pustym wierszem.
   *
   * Jest wyłącznie przy wpisach NASA. Teksty agencji są dobrem publicznym, więc wolno je
   * przetłumaczyć i opublikować u siebie. Wpisy z serwisów objętych prawem autorskim mają
   * to pole puste i prowadzą do wydawcy, i po tym właśnie widok listy poznaje, którą kartę
   * otworzyć u nas, a którą wypuścić na zewnątrz.
   */
  body?: string;
  /** Czy tekst przeszedł przez tłumaczenie maszynowe. Pokazywane czytelnikowi wprost. */
  translated?: boolean;
}

export interface NewsFeed {
  updated: string;
  sources: { label: string; url: string; note: string }[];
  posts: FeedPost[];
}

const KATEGORIE = new Set<string>(Object.keys(CATEGORIES));

/*
 * Sprawdzenie wpisu z pliku.
 *
 * Plik powstaje u nas, ale jego treść pochodzi z cudzych serwisów, więc traktujemy go
 * jak dane z sieci, a nie jak własny kod. Każde pole jest przycinane i sprawdzane,
 * a odnośniki przechodzą przez tę samą kontrolę schematu co wpisy z panelu.
 */
function czytajWpis(surowy: unknown): FeedPost | null {
  if (!surowy || typeof surowy !== 'object') return null;
  const w = surowy as Record<string, unknown>;
  const source = safeUrl(typeof w.source === 'string' ? w.source : undefined);
  const title = cleanText(w.title, LIMITS.title);
  if (!source || !title) return null;
  const date = typeof w.date === 'string' ? w.date : '';
  if (Number.isNaN(Date.parse(date))) return null;
  const category = typeof w.category === 'string' && KATEGORIE.has(w.category) ? w.category : 'odkrycie';
  return {
    id: cleanText(w.id, LIMITS.id) || source,
    title,
    lead: cleanText(w.lead, LIMITS.lead),
    date: new Date(date).toISOString(),
    category: category as NewsCategory,
    source,
    sourceLabel: cleanText(w.sourceLabel, 60) || 'Źródło zewnętrzne',
    language: w.language === 'pl' ? 'pl' : 'en',
    image: safeUrl(typeof w.image === 'string' ? w.image : undefined),
    credit: cleanText(w.credit, 160) || undefined,
    body: cleanText(w.body, LIMITS.body) || undefined,
    translated: w.translated === true,
  };
}

/**
 * Wczytanie pobranych wiadomości.
 *
 * Brak pliku nie jest błędem: aplikacja uruchomiona bez wcześniejszego pobrania ma po
 * prostu same wpisy własne. Dlatego niepowodzenie kończy się pustą listą, a nie wyjątkiem.
 */
export async function loadFeed(signal?: AbortSignal): Promise<NewsFeed | null> {
  try {
    const odp = await fetch(`${import.meta.env.BASE_URL}data/news.json`, { signal });
    if (!odp.ok) return null;
    const dane = (await odp.json()) as Record<string, unknown>;
    const posts = Array.isArray(dane.posts)
      ? dane.posts.map(czytajWpis).filter((p): p is FeedPost => p !== null)
      : [];
    if (!posts.length) return null;
    return {
      updated: typeof dane.updated === 'string' ? dane.updated : '',
      sources: Array.isArray(dane.sources)
        ? (dane.sources as NewsFeed['sources']).filter((s) => s?.label && s?.url)
        : [],
      posts: posts.sort((a, b) => b.date.localeCompare(a.date)),
    };
  } catch {
    return null;
  }
}
