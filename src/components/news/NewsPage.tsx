import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button, Field, Icon, IconButton } from '@/components/ui';
import {
  CATEGORIES,
  createPost,
  exportPosts,
  importPosts,
  loadFeed,
  loadPosts,
  type FeedPost,
  type NewsFeed,
  readingTime,
  restoreSamples,
  savePosts,
  usedImageIds,
  type NewsCategory,
  type NewsPost,
} from '@/lib/news';
import { formatDateFull, relativeDays } from '@/lib/format';
import { deleteImage, listImages, saveImage, updateImage, type StoredImage } from '@/lib/media';
import { useIsAdmin } from '@/state/useAuth';

import { useImages } from './useImages';
import styles from './News.module.css';

/* Wspólny nagłówek podstrony, z przyciskiem powrotu na mapę. */
function PageTop({
  eyebrow,
  title,
  lede,
  actions,
  onBack,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className={styles.top}>
      <div style={{ minWidth: 0 }}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.pageTitle}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
      </div>
      <div className={styles.actions}>
        {actions}
        <IconButton icon="close" label="Wróć na mapę nieba" bordered onClick={onBack} />
      </div>
    </div>
  );
}

/* Na kartach w siatce zostawiamy tylko kategorię i datę, bo dłuższy opis
 * łamałby się tam na trzy wiersze i przytłaczał sam tytuł. */
function PostMeta({ post, compact }: { post: NewsPost; compact?: boolean }) {
  const category = CATEGORIES[post.category];
  return (
    <div className={styles.meta}>
      <span className={styles.category} style={{ color: category.tone }}>
        <span className={styles.filterDot} style={{ background: category.tone }} aria-hidden="true" />
        {category.label}
      </span>
      <span>{formatDateFull(new Date(post.date))}</span>
      {!compact && <span>{readingTime(post)} min czytania</span>}
    </div>
  );
}

/*
 * Wpis na liście: własny albo pobrany z zewnątrz.
 *
 * Oba rodzaje stoją w jednej liście, posortowane po dacie, ale zachowują się inaczej.
 * Własny otwiera się w naszym widoku artykułu. Pobrany otwiera się u nas, jeżeli mamy
 * do jego treści prawo, a w przeciwnym razie prowadzi do wydawcy.
 */
type Wpis = { rodzaj: 'wlasny'; post: NewsPost } | { rodzaj: 'obcy'; post: FeedPost };

/*
 * Karta wpisu.
 *
 * Jeden komponent dla obu rodzajów, bo wyglądać mają tak samo. Różni je wyłącznie to,
 * dokąd prowadzą i co mówi stopka: "Czytaj dalej" przy tekście, który otworzy się u nas,
 * i "Czytaj u wydawcy" przy odnośniku na zewnątrz. Czytelnik ma wiedzieć przed kliknięciem,
 * czy zostaje, czy wychodzi.
 */
function Karta({
  wpis,
  cover,
  duza,
  onOpen,
}: {
  wpis: Wpis;
  cover?: { dataUrl: string; alt: string };
  duza?: boolean;
  onOpen: (sciezka: string) => void;
}) {
  const { post } = wpis;
  const obcy = wpis.rodzaj === 'obcy' ? wpis.post : null;
  const naZewnatrz = obcy !== null && !obcy.body;
  const zdjecie = cover?.dataUrl ?? obcy?.image;
  const klasa = `${styles.item} ${duza ? styles.itemLead : ''} ${naZewnatrz ? styles.itemExternal : ''}`;

  const srodek = (
    <>
      {zdjecie && (
        <img
          className={`${styles.cover} ${duza ? styles.coverLead : ''}`}
          src={zdjecie}
          alt={cover?.alt ?? ''}
          loading="lazy"
          /* Zdjęcie pobrane leży na cudzym serwerze i może zniknąć. Gdy się nie wczyta,
           * chowamy je, zamiast zostawiać na karcie ramkę z ikoną błędu. */
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      {obcy ? <FeedMeta post={obcy} /> : <PostMeta post={post as NewsPost} compact={!duza} />}
      <span className={styles.itemTitle}>{post.title}</span>
      <span className={styles.itemBody}>{post.lead}</span>
      <span className={styles.itemFoot}>
        {naZewnatrz ? 'Czytaj u wydawcy' : 'Czytaj dalej'} <Icon name="arrowUpRight" size={14} />
      </span>
    </>
  );

  if (naZewnatrz && obcy) {
    return (
      <a className={klasa} href={obcy.source} target="_blank" rel="noopener noreferrer">
        {srodek}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={klasa}
      onClick={() => onOpen(obcy ? `/aktualnosci/z/${obcy.id}` : `/aktualnosci/${post.id}`)}
    >
      {srodek}
    </button>
  );
}

/* Opis wpisu pobranego: serwis, data i znacznik przekładu maszynowego. */
function FeedMeta({ post }: { post: FeedPost }) {
  return (
    <div className={styles.meta}>
      <span className={styles.category} style={{ color: CATEGORIES[post.category].tone }}>
        <span
          className={styles.filterDot}
          style={{ background: CATEGORIES[post.category].tone }}
          aria-hidden="true"
        />
        {post.sourceLabel}
      </span>
      <span>{formatDateFull(new Date(post.date))}</span>
      {post.translated && <span title="Przetłumaczone maszynowo z angielskiego">przekład</span>}
      {post.language === 'en' && <span>po angielsku</span>}
    </div>
  );
}

/* --------------------------------------------------------------- lista wpisów */

export function NewsListPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<NewsPost[]>(() => loadPosts());
  const [filter, setFilter] = useState<NewsCategory | null>(null);
  const [feed, setFeed] = useState<NewsFeed | null>(null);

  /* Wpisy mogły zostać zmienione w panelu redakcyjnym, więc odświeżamy je
   * przy każdym wejściu na listę. */
  useEffect(() => setPosts(loadPosts()), []);

  /* Wiadomości pobrane z cudzych serwisów. Wczytujemy je po wyrysowaniu strony, żeby
   * lista wpisów własnych pojawiła się od razu i nie czekała na sieć. */
  useEffect(() => {
    const przerwij = new AbortController();
    loadFeed(przerwij.signal).then(setFeed);
    return () => przerwij.abort();
  }, []);

  /*
   * Jedna lista zamiast dwóch.
   *
   * Wpisy pobrane leżały wcześniej w osobnej sekcji pod wpisami własnymi. Wyglądało to
   * porządnie, ale w praktyce oznaczało, że świeża wiadomość sprzed godziny stała pod
   * sześcioma tekstami sprzed miesięcy i trzeba było do niej przewinąć całą stronę.
   * Kolejność w serwisie z aktualnościami ustala data, a nie to, kto jest właścicielem
   * tekstu. Skąd wpis pochodzi, mówi etykieta na karcie.
   */
  const wszystkie = useMemo<Wpis[]>(() => {
    const wlasne: Wpis[] = posts.map((p) => ({ rodzaj: 'wlasny', post: p }));
    const obce: Wpis[] = (feed?.posts ?? []).map((p) => ({ rodzaj: 'obcy', post: p }));
    return [...wlasne, ...obce].sort((a, b) => b.post.date.localeCompare(a.post.date));
  }, [posts, feed]);

  const visible = useMemo(
    () => (filter ? wszystkie.filter((w) => w.post.category === filter) : wszystkie),
    [wszystkie, filter],
  );
  const [lead, ...rest] = visible;
  const covers = useImages(
    visible.map((w) => (w.rodzaj === 'wlasny' ? w.post.coverId : undefined)),
  );
  const isAdmin = useIsAdmin();

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageTop
          eyebrow="Aktualności"
          title="Co słychać w astronomii"
          lede={
            isAdmin
              ? 'Starty rakiet, nowe teleskopy, odkrycia i praktyczne wskazówki obserwacyjne. Wpisy prowadzisz w panelu redakcyjnym.'
              : 'Starty rakiet, nowe teleskopy, odkrycia i praktyczne wskazówki obserwacyjne, zebrane w jednym miejscu.'
          }
          onBack={() => navigate('/')}
          actions={
            isAdmin ? (
              <Button icon="plus" onClick={() => navigate('/aktualnosci/panel')}>
                Panel redakcyjny
              </Button>
            ) : (
              <Button icon="lock" onClick={() => navigate('/konto')}>
                Zaloguj się
              </Button>
            )
          }
        />

        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.filter} ${filter === null ? styles.filterActive : ''}`}
            onClick={() => setFilter(null)}
          >
            Wszystkie
            <span style={{ opacity: 0.6 }}>{wszystkie.length}</span>
          </button>
          {(Object.keys(CATEGORIES) as NewsCategory[]).map((key) => {
            const count = wszystkie.filter((w) => w.post.category === key).length;
            if (count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.filter} ${filter === key ? styles.filterActive : ''}`}
                onClick={() => setFilter(filter === key ? null : key)}
              >
                <span
                  className={styles.filterDot}
                  style={{ background: CATEGORIES[key].tone }}
                  aria-hidden="true"
                />
                {CATEGORIES[key].label}
                <span style={{ opacity: 0.6 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className={styles.note}>
            Brak wpisów w tej kategorii. Dodaj pierwszy w panelu redakcyjnym.
          </div>
        ) : (
          <div className={styles.list}>
            <Karta
              wpis={lead}
              duza
              cover={lead.rodzaj === 'wlasny' ? covers.get(lead.post.coverId ?? '') : undefined}
              onOpen={navigate}
            />

            {rest.length > 0 && (
              <div className={styles.grid}>
                {rest.map((wpis) => (
                  <Karta
                    key={wpis.post.id}
                    wpis={wpis}
                    cover={
                      wpis.rodzaj === 'wlasny' ? covers.get(wpis.post.coverId ?? '') : undefined
                    }
                    onOpen={navigate}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- artykuł */

export function NewsArticlePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const post = useMemo(() => loadPosts().find((p) => p.id === id) ?? null, [id]);

  if (!post) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <PageTop
            eyebrow="Aktualności"
            title="Nie ma takiego wpisu"
            lede="Wpis mógł zostać usunięty w panelu redakcyjnym albo odnośnik jest nieaktualny."
            onBack={() => navigate('/aktualnosci')}
          />
          <Button variant="primary" onClick={() => navigate('/aktualnosci')}>
            Wróć do listy
          </Button>
        </div>
      </div>
    );
  }

  return <NewsArticleBody post={post} onBack={() => navigate('/aktualnosci')} onClose={() => navigate('/')} />;
}

/* ------------------------------------------------- artykuł pobrany z zewnątrz */

/*
 * Artykuł ze źródła zewnętrznego, czytany u nas.
 *
 * Dotyczy wyłącznie tekstów NASA. Prace pracowników agencji federalnej są w Stanach
 * Zjednoczonych dobrem publicznym, więc wolno je przetłumaczyć i opublikować. Wpisy
 * z serwisów objętych prawem autorskim nie mają pola z treścią i w ogóle tu nie trafiają,
 * bo ich karty na liście prowadzą prosto do wydawcy.
 *
 * Nad tekstem stoi pasek mówiący, skąd pochodzi i czy przeszedł przez tłumaczenie
 * maszynowe, a pod tekstem odnośnik do oryginału. Czytelnik ma widzieć, że czyta
 * cudzy materiał w naszym przekładzie, a nie tekst redakcji AstroZenitu.
 */
export function FeedArticlePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [laduje, setLadowanie] = useState(true);

  useEffect(() => {
    const przerwij = new AbortController();
    loadFeed(przerwij.signal).then((f) => {
      setFeed(f);
      setLadowanie(false);
    });
    return () => przerwij.abort();
  }, []);

  const post = feed?.posts.find((p) => p.id === id) ?? null;

  if (laduje) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <PageTop
            eyebrow="Aktualności"
            title="Wczytywanie"
            lede="Pobieram treść wiadomości."
            onBack={() => navigate('/aktualnosci')}
          />
        </div>
      </div>
    );
  }

  if (!post || !post.body) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <PageTop
            eyebrow="Aktualności"
            title="Nie ma takiej wiadomości"
            lede="Wiadomość mogła wypaść z listy przy kolejnym pobraniu. Pobieramy tylko dwadzieścia kilka najnowszych."
            onBack={() => navigate('/aktualnosci')}
          />
          <Button variant="primary" onClick={() => navigate('/aktualnosci')}>
            Wróć do listy
          </Button>
        </div>
      </div>
    );
  }

  const akapity = post.body.split(/\n{2,}/).filter((t) => t.trim());

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageTop
          eyebrow={post.sourceLabel}
          title={post.title}
          lede={post.lead}
          onBack={() => navigate('/aktualnosci')}
        />

        <div className={styles.feedBadge}>
          <span>{formatDateFull(new Date(post.date))}</span>
          <span aria-hidden="true">/</span>
          <span>Tekst: {post.sourceLabel}</span>
          {post.translated && (
            <>
              <span aria-hidden="true">/</span>
              <span>Przekład maszynowy z angielskiego</span>
            </>
          )}
        </div>

        {post.image && (
          <img
            className={styles.feedCover}
            src={post.image}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        <article className={`${styles.article} ${styles.prose}`}>
          {akapity.map((tekst, i) => (
            <p key={i}>{tekst}</p>
          ))}
        </article>

        <div className={styles.feedFoot}>
          <p>
            Materiał źródłowy: {post.sourceLabel}. Teksty NASA są w Stanach Zjednoczonych
            dobrem publicznym, więc wolno je tłumaczyć i publikować.
            {post.credit && post.credit !== 'NASA' ? ` Zdjęcie: ${post.credit}.` : ''}
          </p>
          <a href={post.source} target="_blank" rel="noopener noreferrer">
            Otwórz oryginał <Icon name="arrowUpRight" size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

/*
 * Treść artykułu.
 *
 * Akapit złożony wyłącznie ze znacznika w postaci [zdjecie:N] zamienia się na zdjęcie
 * o tym numerze. Celowo nie przyjmujemy tu kodu HTML: gdyby redaktor mógł wstawić
 * dowolny znacznik, wpis stałby się drogą do wstrzyknięcia skryptu, a to jedyne realne
 * zagrożenie w aplikacji bez serwera. Prosty znacznik własny daje ten sam efekt
 * bez otwierania tej furtki.
 */
function NewsArticleBody({
  post,
  onBack,
  onClose,
}: {
  post: NewsPost;
  onBack: () => void;
  onClose: () => void;
}) {
  const images = useImages([post.coverId, ...(post.imageIds ?? [])]);
  const gallery = (post.imageIds ?? []).map((id) => images.get(id)).filter(Boolean) as StoredImage[];
  const cover = post.coverId ? images.get(post.coverId) : undefined;
  const blocks = post.body.split(/\n{2,}/).filter(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <Button icon="chevronLeft" variant="ghost" onClick={onBack}>
            Wszystkie wpisy
          </Button>
          <div className={styles.actions}>
            <IconButton icon="close" label="Wróć na mapę nieba" bordered onClick={onClose} />
          </div>
        </div>

        <article className={styles.article}>
          <PostMeta post={post} />
          <h1 className={styles.articleTitle}>{post.title}</h1>
          {cover && (
            <figure className={styles.figure}>
              <img src={cover.dataUrl} alt={cover.alt || ''} />
              {cover.alt && <figcaption className={styles.figcaption}>{cover.alt}</figcaption>}
            </figure>
          )}
          <p className={styles.articleLead}>{post.lead}</p>
          <div className={styles.prose}>
            {blocks.map((block, i) => {
              const marker = block.trim().match(/^\[zdjecie:(\d{1,2})\]$/);
              if (marker) {
                const image = gallery[Number(marker[1]) - 1];
                if (!image) return null;
                /* Okładka otwiera już artykuł, więc jej powtórzenie w treści pomijamy. */
                if (image.id === post.coverId) return null;
                return (
                  <figure key={i} className={styles.figure}>
                    <img src={image.dataUrl} alt={image.alt || ''} />
                    {image.alt && <figcaption className={styles.figcaption}>{image.alt}</figcaption>}
                  </figure>
                );
              }
              return <p key={i}>{block}</p>;
            })}
          </div>
          {post.source && (
            <a className={styles.sourceLink} href={post.source} target="_blank" rel="noreferrer">
              Źródło <Icon name="arrowUpRight" size={14} />
            </a>
          )}
          <p className={styles.meta} style={{ marginTop: 'var(--space-6)' }}>
            Opublikowano {relativeDays(new Date(post.date))}
          </p>
        </article>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- panel redakcyjny */

const EMPTY = { title: '', lead: '', body: '', source: '', category: 'misja' as NewsCategory, date: '' };

export function NewsEditorPage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const [posts, setPosts] = useState<NewsPost[]>(() => loadPosts());
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  /* Zdjęcia dołączone do przygotowywanego wpisu. */
  const [images, setImages] = useState<StoredImage[]>([]);
  const [coverId, setCoverId] = useState<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  /*
   * Bramka dostępu.
   *
   * Uwaga: to jest osłona interfejsu, a nie zabezpieczenie danych. Wpisy siedzą
   * w pamięci przeglądarki i osoba znająca narzędzia deweloperskie sięgnie po nie
   * niezależnie od tego warunku. Prawdziwa kontrola dostępu wymaga serwera,
   * który po prostu nie odda cudzych danych.
   */
  useEffect(() => {
    if (!isAdmin) navigate('/konto', { replace: true });
  }, [isAdmin, navigate]);

  /*
   * Sprzątanie osieroconych zdjęć.
   *
   * Zdjęcie trafia do bazy w chwili wybrania, a nie dopiero przy zapisie wpisu, bo inaczej
   * nie dałoby się pokazać miniatury. Porzucony szkic zostawia więc pliki, do których nic
   * już nie prowadzi. Panel czyści je przy wejściu: wszystko, czego nie wskazuje żaden wpis,
   * jest w tym momencie z definicji śmieciem. Uruchamiamy to przed dodaniem czegokolwiek
   * w tej sesji, więc nie ma jak skasować zdjęcia z przygotowywanego właśnie szkicu.
   */
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      const stored = await listImages();
      if (cancelled) return;
      const used = usedImageIds(loadPosts());
      for (const image of stored) {
        if (!used.has(image.id)) await deleteImage(image.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const reset = () => {
    setDraft(EMPTY);
    setEditingId(null);
    setImages([]);
    setCoverId(undefined);
  };

  /* Dodanie zdjęć. Każdy plik przechodzi przez przerysowanie na płótnie,
   * co przy okazji odrzuca wszystko, co nie jest prawdziwym obrazem. */
  const addPhotos = async (files: FileList) => {
    setUploading(true);
    const added: StoredImage[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files).slice(0, 12)) {
      const result = await saveImage(file, '');
      if (result.ok) added.push(result.image);
      else problems.push(`${file.name}: ${result.reason}`);
    }
    setUploading(false);
    if (added.length) {
      setImages((current) => [...current, ...added]);
      if (!coverId && added[0]) setCoverId(added[0].id);
    }
    setMessage(
      problems.length
        ? `Dodano ${added.length} zdjęć. Pominięto: ${problems.join('; ')}`
        : `Dodano ${added.length} ${added.length === 1 ? 'zdjęcie' : 'zdjęcia'}.`,
    );
  };

  const setAlt = (id: string, alt: string) => {
    setImages((current) => current.map((image) => (image.id === id ? { ...image, alt } : image)));
  };

  const dropPhoto = async (id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    if (coverId === id) setCoverId(undefined);
    await deleteImage(id);
  };

  const submit = async () => {
    if (!draft.title.trim()) {
      setMessage('Wpis musi mieć tytuł.');
      return;
    }
    /* Opisy alternatywne trafiają do bazy razem ze zdjęciami dopiero przy zapisie wpisu. */
    for (const image of images) await updateImage(image);

    const base = createPost({
      ...draft,
      date: draft.date ? new Date(draft.date).toISOString() : new Date().toISOString(),
      coverId,
      imageIds: images.map((image) => image.id),
    });
    const next = editingId
      ? posts.map((p) => (p.id === editingId ? { ...base, id: editingId } : p))
      : [...posts, base];
    setPosts(savePosts(next));
    setMessage(editingId ? 'Wpis zapisany.' : 'Wpis dodany.');
    reset();
  };

  const edit = async (post: NewsPost) => {
    setEditingId(post.id);
    const stored = await listImages();
    const wanted = new Set([post.coverId, ...(post.imageIds ?? [])].filter(Boolean));
    setImages(
      (post.imageIds ?? [])
        .map((id) => stored.find((image) => image.id === id))
        .filter((image): image is StoredImage => Boolean(image)),
    );
    setCoverId(post.coverId && wanted.has(post.coverId) ? post.coverId : undefined);
    setDraft({
      title: post.title,
      lead: post.lead,
      body: post.body,
      source: post.source ?? '',
      category: post.category,
      date: post.date.slice(0, 10),
    });
    setMessage(null);
  };

  const remove = async (post: NewsPost) => {
    const next = savePosts(posts.filter((p) => p.id !== post.id));
    setPosts(next);
    if (editingId === post.id) reset();
    /* Zdjęcia usuniętego wpisu nie są już nikomu potrzebne, a zajmują miejsce w bazie. */
    const used = usedImageIds(next);
    for (const id of [post.coverId, ...(post.imageIds ?? [])]) {
      if (id && !used.has(id)) await deleteImage(id);
    }
    setMessage(`Usunięto wpis „${post.title}”.`);
  };

  const download = () => {
    const blob = new Blob([exportPosts(posts)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zenit-aktualnosci.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Plik z wpisami został pobrany.');
  };

  const upload = async (file: File) => {
    const result = importPosts(await file.text());
    if ('error' in result) {
      setMessage(result.error);
      return;
    }
    setPosts(savePosts(result.posts));
    setMessage(`Wczytano ${result.posts.length} wpisów.`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageTop
          eyebrow="Aktualności"
          title="Panel redakcyjny"
          lede="Dodawaj, poprawiaj i usuwaj wpisy. Treść zapisuje się w tej przeglądarce, a przycisk eksportu tworzy plik JSON gotowy do przeniesienia gdzie indziej."
          onBack={() => navigate('/aktualnosci')}
          actions={
            <Button icon="arrowUpRight" onClick={() => navigate('/aktualnosci')}>
              Podgląd strony
            </Button>
          }
        />

        <div className={styles.editor}>
          <Field
            label={editingId ? 'Tytuł, tryb edycji' : 'Tytuł'}
            placeholder="Na przykład: Rakieta wyniosła nowy teleskop na orbitę"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          <div>
            <label className={styles.eyebrow} htmlFor="zajawka" style={{ marginBottom: 8 }}>
              Zajawka
            </label>
            <textarea
              id="zajawka"
              className={styles.textarea}
              placeholder="Jedno albo dwa zdania, które zobaczy czytelnik na liście."
              value={draft.lead}
              onChange={(e) => setDraft({ ...draft, lead: e.target.value })}
            />
          </div>

          <div>
            <label className={styles.eyebrow} htmlFor="tresc" style={{ marginBottom: 8 }}>
              Treść, akapity oddzielone pustym wierszem
            </label>
            <textarea
              id="tresc"
              className={`${styles.textarea} ${styles.textareaTall}`}
              placeholder="Pełny tekst wpisu."
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </div>

          <div>
            <p className={styles.eyebrow} style={{ marginBottom: 8 }}>
              Zdjęcia
            </p>
            <div
              className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length) void addPhotos(e.dataTransfer.files);
              }}
            >
              <p className={styles.accountMeta}>
                Przeciągnij pliki tutaj albo wybierz je z dysku. Każdy obraz jest zmniejszany
                do 1600 pikseli szerokości i zapisywany ponownie, przez co znikają z niego
                dane dodatkowe, w tym współrzędne miejsca wykonania zdjęcia.
              </p>
              <Button
                icon="plus"
                loading={uploading}
                onClick={() => photoRef.current?.click()}
              >
                {uploading ? 'Przetwarzam' : 'Wybierz zdjęcia'}
              </Button>
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) void addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {images.length > 0 && (
              <>
                <div className={styles.gallery} style={{ marginTop: 'var(--space-3)' }}>
                  {images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      className={`${styles.galleryItem} ${coverId === image.id ? styles.galleryItemActive : ''}`}
                      onClick={() => setCoverId(coverId === image.id ? undefined : image.id)}
                      title={coverId === image.id ? 'Okładka wpisu' : 'Ustaw jako okładkę'}
                    >
                      <img src={image.dataUrl} alt={image.alt || `Zdjęcie ${index + 1}`} />
                      <span className={styles.galleryBadge}>
                        {coverId === image.id ? 'okładka' : `${index + 1}`}
                      </span>
                    </button>
                  ))}
                </div>

                <div className={styles.editorList} style={{ marginTop: 'var(--space-3)' }}>
                  {images.map((image, index) => (
                    <div key={image.id} className={styles.editorItem}>
                      <span className={styles.galleryBadge} style={{ position: 'static' }}>
                        {index + 1}
                      </span>
                      <span className={styles.editorItemMain}>
                        <Field
                          label={`Opis zdjęcia ${index + 1}`}
                          hideLabel
                          placeholder={`Opis zdjęcia ${index + 1}, czytany przez czytniki ekranu`}
                          value={image.alt}
                          onChange={(e) => setAlt(image.id, e.target.value)}
                        />
                      </span>
                      <IconButton
                        icon="plus"
                        label={`Wstaw zdjęcie ${index + 1} w treść`}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            body: `${d.body.trimEnd()}\n\n[zdjecie:${index + 1}]\n\n`,
                          }))
                        }
                      />
                      <IconButton
                        icon="close"
                        label={`Usuń zdjęcie ${index + 1}`}
                        onClick={() => void dropPhoto(image.id)}
                      />
                    </div>
                  ))}
                </div>
                <p className={styles.accountMeta} style={{ marginTop: 'var(--space-2)' }}>
                  Kliknięcie miniatury ustawia okładkę. Znacznik w postaci [zdjecie:1] w treści
                  wstawia zdjęcie o tym numerze w tym miejscu. Zdjęcie wybrane na okładkę otwiera
                  artykuł, więc jego znacznik w treści zostanie pominięty.
                </p>
              </>
            )}
          </div>

          <div className={styles.editorRow}>
            <div>
              <label className={styles.eyebrow} htmlFor="kategoria" style={{ marginBottom: 8 }}>
                Kategoria
              </label>
              <select
                id="kategoria"
                className={styles.select}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as NewsCategory })}
              >
                {(Object.keys(CATEGORIES) as NewsCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {CATEGORIES[key].label}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Data publikacji"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              hint="Puste pole oznacza dzisiaj."
            />
          </div>

          <Field
            label="Odnośnik do źródła"
            placeholder="https://"
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            hint="Opcjonalny. Pojawi się na końcu wpisu."
          />

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="primary" icon={editingId ? 'check' : 'plus'} onClick={() => void submit()}>
              {editingId ? 'Zapisz zmiany' : 'Dodaj wpis'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={reset}>
                Anuluj edycję
              </Button>
            )}
            <span style={{ flex: 1 }} />
            <Button icon="arrowUpRight" onClick={download}>
              Eksportuj do pliku
            </Button>
            <Button icon="plus" onClick={() => fileRef.current?.click()}>
              Wczytaj z pliku
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </div>

          {message && (
            <p className={styles.note} role="status">
              {message}
            </p>
          )}

          <div>
            <p className={styles.eyebrow}>Wpisy ({posts.length})</p>
            <div className={styles.editorList}>
              {posts.map((post) => (
                <div key={post.id} className={styles.editorItem}>
                  <span
                    className={styles.filterDot}
                    style={{ background: CATEGORIES[post.category].tone }}
                    aria-hidden="true"
                  />
                  <span className={styles.editorItemMain}>
                    <span className={styles.editorItemTitle}>{post.title}</span>
                    <span className={styles.editorItemMeta}>
                      {formatDateFull(new Date(post.date))} , {CATEGORIES[post.category].label}
                    </span>
                  </span>
                  <IconButton icon="arrowUpRight" label={`Edytuj: ${post.title}`} onClick={() => void edit(post)} />
                  <IconButton icon="close" label={`Usuń: ${post.title}`} onClick={() => void remove(post)} />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.note}>
            Wpisy żyją w pamięci tej przeglądarki, więc nie zobaczy ich nikt inny i znikną po
            wyczyszczeniu danych witryny. Taka jest cena braku zaplecza serwerowego. Eksport do
            pliku JSON jest tu drogą wyjścia: ten sam plik można wczytać na innym urządzeniu albo
            podać jako źródło prawdziwemu systemowi zarządzania treścią.
            <br />
            <br />
            <Button variant="quiet" onClick={() => { setPosts(restoreSamples()); setMessage('Przywrócono zestaw początkowy.'); }}>
              Przywróć zestaw początkowy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
