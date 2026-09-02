import { create } from 'zustand';

import type { SkyObjectRef } from '@/lib/render/types';
import { refKey } from '@/lib/render/types';

/*
 * LISTA OBSERWACYJNA
 *
 * Do czasu uruchomienia serwera lista leży w pamięci trwałej przeglądarki, osobno
 * dla każdego zalogowanego użytkownika. Kształt danych jest już taki, jaki przyjmie
 * tabela favourites na zapleczu, więc przeniesienie sprowadzi się do zamiany dwóch
 * funkcji odczytu i zapisu na wywołania sieciowe, bez ruszania sekcji ani przycisków.
 *
 * Klucz przechowywania zawiera nazwę użytkownika, i to jest istotne: na wspólnym
 * komputerze wylogowanie ma odciąć dostęp do listy, a nie tylko schować przycisk.
 */

export interface Favourite {
  /** Odwołanie do obiektu w postaci "star:32349", "dso:M31", "body:saturn". */
  ref: string;
  /** Nazwa w chwili dodania, żeby spis dało się wyświetlić bez katalogu. */
  label: string;
  /** Krótki opis rodzaju, na przykład "gwiazda" albo "mgławica". */
  kind: string;
  note: string | null;
  /** Chwila zaobserwowania, jeżeli obiekt został już odhaczony. */
  observedAt: number | null;
  createdAt: number;
}

/* Ten sam limit co na zapleczu. Konto ma być listą obserwacyjną, a nie magazynem. */
export const LIMIT = 500;

const kluczPamieci = (login: string) => `zenit:ulubione:${login}`;

function odczytaj(login: string | null): Favourite[] {
  if (!login || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(kluczPamieci(login));
    if (!raw) return [];
    const dane = JSON.parse(raw) as Favourite[];
    return Array.isArray(dane) ? dane : [];
  } catch {
    /* Uszkodzony wpis traktujemy jak brak wpisu. Lista obserwacyjna nie jest
     * warta wywracania aplikacji. */
    return [];
  }
}

function zapisz(login: string, lista: Favourite[]): void {
  try {
    window.localStorage.setItem(kluczPamieci(login), JSON.stringify(lista));
  } catch {
    /* Brak miejsca w pamięci trwałej. Lista zostaje w pamięci karty. */
  }
}

interface FavouritesState {
  /** Login, dla którego wczytano listę. Null oznacza brak zalogowania. */
  login: string | null;
  items: Favourite[];
  /** Wczytuje listę zalogowanego użytkownika. Wywoływane przy zmianie sesji. */
  sync: (login: string | null) => void;
  add: (item: Omit<Favourite, 'createdAt' | 'observedAt' | 'note'>) => boolean;
  remove: (ref: string) => void;
  toggle: (item: Omit<Favourite, 'createdAt' | 'observedAt' | 'note'>) => void;
  setNote: (ref: string, note: string | null) => void;
  setObserved: (ref: string, observed: boolean) => void;
  has: (ref: string) => boolean;
}

export const useFavouritesStore = create<FavouritesState>((set, get) => ({
  login: null,
  items: [],

  sync: (login) => {
    if (get().login === login) return;
    set({ login, items: odczytaj(login) });
  },

  add: (item) => {
    const { login, items } = get();
    if (!login) return false;
    if (items.some((i) => i.ref === item.ref)) return true;
    if (items.length >= LIMIT) return false;
    const nowa: Favourite[] = [
      { ...item, note: null, observedAt: null, createdAt: Date.now() },
      ...items,
    ];
    zapisz(login, nowa);
    set({ items: nowa });
    return true;
  },

  remove: (ref) => {
    const { login, items } = get();
    if (!login) return;
    const nowa = items.filter((i) => i.ref !== ref);
    zapisz(login, nowa);
    set({ items: nowa });
  },

  toggle: (item) => {
    const { items } = get();
    if (items.some((i) => i.ref === item.ref)) get().remove(item.ref);
    else get().add(item);
  },

  setNote: (ref, note) => {
    const { login, items } = get();
    if (!login) return;
    const nowa = items.map((i) => (i.ref === ref ? { ...i, note } : i));
    zapisz(login, nowa);
    set({ items: nowa });
  },

  setObserved: (ref, observed) => {
    const { login, items } = get();
    if (!login) return;
    const nowa = items.map((i) =>
      i.ref === ref ? { ...i, observedAt: observed ? Date.now() : null } : i,
    );
    zapisz(login, nowa);
    set({ items: nowa });
  },

  has: (ref) => get().items.some((i) => i.ref === ref),
}));

/** Klucz obiektu w postaci używanej przez listę. */
export const favouriteKey = (ref: SkyObjectRef): string => refKey(ref);
