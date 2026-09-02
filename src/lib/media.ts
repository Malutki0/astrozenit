/*
 * Zdjęcia do artykułów.
 *
 * Obrazy nie trafiają do pamięci lokalnej razem z tekstem, bo ta ma około pięciu
 * megabajtów pojemności i kilka zdjęć by ją wypełniło. Zamiast tego lądują w bazie
 * IndexedDB, a we wpisie zostaje sam identyfikator.
 *
 * Każdy plik jest przed zapisem przerysowywany na płótnie do ustalonej szerokości
 * i zapisywany ponownie jako JPEG. Ma to trzy skutki naraz: plik maleje kilkunastokrotnie,
 * znikają dane dodatkowe zapisane w pliku, w tym współrzędne miejsca wykonania zdjęcia,
 * a przeglądarka odrzuca wszystko, co nie jest prawdziwym obrazem. To ostatnie jest
 * zabezpieczeniem: plik podszywający się pod zdjęcie nie przejdzie przez dekoder.
 */

const DB_NAME = 'zenit-media';
const STORE = 'obrazy';
const DB_VERSION = 1;

/** Największa dopuszczalna szerokość zapisywanego obrazu. */
const MAX_WIDTH = 1600;
/** Największy dopuszczalny plik wejściowy. */
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
/** Największy dopuszczalny obraz po przetworzeniu. */
const MAX_STORED_BYTES = 1.6 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export interface StoredImage {
  id: string;
  /** Obraz w postaci zapisu tekstowego, gotowy do wstawienia w atrybut źródła. */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  /** Opis dla czytników ekranu, wpisywany przez redaktora. */
  alt: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}

/*
 * Przetworzenie pliku na obraz o kontrolowanym rozmiarze.
 *
 * Jakość zapisu jest dobierana iteracyjnie: zaczynamy wysoko i schodzimy w dół,
 * dopóki wynik nie zmieści się w limicie. Dzięki temu małe zdjęcia zostają ostre,
 * a duże nie rozsadzają bazy.
 */
async function normalize(file: File): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.72, 0.62, 0.5, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    /* Zapis tekstowy zajmuje mniej więcej cztery trzecie danych binarnych. */
    if ((dataUrl.length * 3) / 4 <= MAX_STORED_BYTES) return { dataUrl, width, height };
  }
  return null;
}

export type SaveResult = { ok: true; image: StoredImage } | { ok: false; reason: string };

export async function saveImage(file: File, alt: string): Promise<SaveResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, reason: 'Dozwolone są pliki JPEG, PNG, WebP, GIF i AVIF.' };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, reason: `Plik jest większy niż ${Math.round(MAX_INPUT_BYTES / 1048576)} MB.` };
  }

  const normalized = await normalize(file);
  if (!normalized) {
    return { ok: false, reason: 'Nie udało się odczytać tego pliku jako obrazu.' };
  }

  const image: StoredImage = {
    id: `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl: normalized.dataUrl,
    width: normalized.width,
    height: normalized.height,
    bytes: Math.round((normalized.dataUrl.length * 3) / 4),
    createdAt: Date.now(),
    alt: alt.slice(0, 300),
  };

  const saved = await transact('readwrite', (store) => store.put(image) as IDBRequest<IDBValidKey>);
  if (saved === null) {
    return { ok: false, reason: 'Nie udało się zapisać obrazu w tej przeglądarce.' };
  }
  return { ok: true, image };
}

/** Zapisuje zmieniony opis alternatywny, bez ponownego przetwarzania obrazu. */
export async function updateImage(image: StoredImage): Promise<void> {
  if (!/^img-[a-z0-9-]+$/i.test(image.id)) return;
  await transact('readwrite', (store) =>
    store.put({ ...image, alt: image.alt.slice(0, 300) }) as IDBRequest<IDBValidKey>,
  );
}

export async function loadImage(id: string): Promise<StoredImage | null> {
  if (!/^img-[a-z0-9-]+$/i.test(id)) return null;
  const result = await transact('readonly', (store) => store.get(id) as IDBRequest<StoredImage>);
  return result ?? null;
}

export async function loadImages(ids: string[]): Promise<Map<string, StoredImage>> {
  const out = new Map<string, StoredImage>();
  await Promise.all(
    ids.map(async (id) => {
      const image = await loadImage(id);
      if (image) out.set(id, image);
    }),
  );
  return out;
}

export async function deleteImage(id: string): Promise<void> {
  if (!/^img-[a-z0-9-]+$/i.test(id)) return;
  await transact('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function listImages(): Promise<StoredImage[]> {
  const result = await transact('readonly', (store) => store.getAll() as IDBRequest<StoredImage[]>);
  return (result ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

/** Łączny rozmiar zapisanych obrazów, do pokazania w panelu. */
export async function usedBytes(): Promise<number> {
  const images = await listImages();
  return images.reduce((sum, image) => sum + image.bytes, 0);
}
