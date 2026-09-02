/*
 * Konta i logowanie.
 *
 * UWAGA, RZECZ KLUCZOWA DLA OCENY BEZPIECZEŃSTWA
 *
 * AstroZenit działa w całości w przeglądarce i nie ma zaplecza serwerowego. Sprawdzanie
 * hasła odbywa się więc na urządzeniu użytkownika, a to znaczy, że osoba znająca
 * narzędzia deweloperskie obejdzie ten mechanizm w kilka minut, choćby podmieniając
 * zawartość pamięci sesji.
 *
 * Co ten moduł faktycznie daje:
 *   - hasło nigdy nie jest przechowywane jawnie, tylko jako skrót PBKDF2 z solą,
 *   - porównanie skrótów jest wykonywane w stałym czasie,
 *   - kolejne nieudane próby są opóźniane rosnąco,
 *   - panel redakcyjny jest niedostępny dla zwykłego odwiedzającego.
 *
 * Czego nie daje:
 *   - ochrony treści przed kimś, kto zna przeglądarkę,
 *   - jakiejkolwiek gwarancji, że dane nie zostaną podmienione lokalnie.
 *
 * Prawdziwe zabezpieczenie wymaga serwera, który sprawdza hasło i wydaje token.
 * Miejsce podmiany jest jedno: interfejs AuthProvider poniżej. Implementacja zdalna
 * ma odpytać własne API i zwrócić ten sam kształt wyniku, a reszta aplikacji
 * nie wymaga żadnych zmian.
 */

import { RemoteAuthProvider } from './authRemote';
import { SupabaseAuthProvider } from './authSupabase';

export type Role = 'gosc' | 'czytelnik' | 'admin';

export interface Session {
  login: string;
  role: Role;
  /** Chwila zalogowania, w milisekundach. */
  since: number;
}

export interface Credentials {
  /** Sól w zapisie szesnastkowym. */
  salt: string;
  iterations: number;
  /** Skrót w zapisie szesnastkowym. */
  hash: string;
}

/*
 * Poświadczenia administratora wbudowane w aplikację.
 * Wygenerowane skryptem scripts/make-admin-hash.mjs. Samo hasło nie występuje
 * nigdzie w repozytorium, jest tu wyłącznie jego skrót.
 * Zmiana hasła w panelu konta nadpisuje te wartości w pamięci przeglądarki.
 */
const BUILTIN_ADMIN: Credentials = {
  salt: 'd38d3cdf89c8ef950e9f576123ba91ef',
  iterations: 310000,
  hash: '2117326fbefe1a2ebccd800afdeb23b0c2a67553f6613f79aebd3ad4fbd81812',
};

export const ADMIN_LOGIN = 'admin';

const SESSION_KEY = 'zenit:sesja';
const CREDENTIALS_KEY = 'zenit:poswiadczenia';
const ATTEMPTS_KEY = 'zenit:proby-logowania';
const USERS_KEY = 'zenit:konta';

const KEY_LENGTH = 32;

/* ---------------------------------------------------------------- narzędzia */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Porównanie w stałym czasie.
 *
 * Zwykłe porównanie łańcuchów kończy się na pierwszej różnicy, przez co czas jego
 * wykonania zdradza, ile początkowych znaków się zgadza. Tutaj zawsze przechodzimy
 * przez całą długość.
 */
function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Wyprowadza skrót hasła. Ta sama funkcja i te same parametry co w skrypcie generującym. */
export async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_LENGTH * 8,
  );
  return toHex(bits);
}

/* --------------------------------------------------- opóźnianie prób logowania */

interface Attempts {
  count: number;
  /** Chwila, przed którą kolejna próba nie zostanie przyjęta. */
  blockedUntil: number;
}

function readAttempts(): Attempts {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return { count: 0, blockedUntil: 0 };
    const parsed = JSON.parse(raw) as Attempts;
    return {
      count: Number(parsed.count) || 0,
      blockedUntil: Number(parsed.blockedUntil) || 0,
    };
  } catch {
    return { count: 0, blockedUntil: 0 };
  }
}

function writeAttempts(attempts: Attempts): void {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    /* Brak pamięci nie może zablokować logowania. */
  }
}

/** Ile sekund trzeba jeszcze odczekać przed kolejną próbą. Zero oznacza brak blokady. */
export function lockoutSeconds(): number {
  const { blockedUntil } = readAttempts();
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

/* ---------------------------------------------------------------- poświadczenia */

function currentCredentials(): Credentials {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return BUILTIN_ADMIN;
    const parsed = JSON.parse(raw) as Credentials;
    if (
      typeof parsed.salt === 'string' &&
      /^[0-9a-f]+$/.test(parsed.salt) &&
      typeof parsed.hash === 'string' &&
      /^[0-9a-f]+$/.test(parsed.hash) &&
      Number.isInteger(parsed.iterations) &&
      parsed.iterations >= 100000
    ) {
      return parsed;
    }
    return BUILTIN_ADMIN;
  } catch {
    return BUILTIN_ADMIN;
  }
}

/* --------------------------------------------------------------- kontrakt */

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'dane' | 'blokada'; waitSeconds?: number };

export interface AuthProvider {
  readonly id: string;
  /** Czy sprawdzanie odbywa się lokalnie, czyli bez realnej ochrony treści. */
  readonly local: boolean;
  login(loginName: string, password: string): Promise<LoginResult>;
  changePassword(currentPassword: string, nextPassword: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /*
   * Założenie konta.
   *
   * Zwraca informację, czy konto zostało utworzone i czy od razu loguje. Implementacja
   * lokalna loguje od razu, bo nie ma jak wysłać wiadomości potwierdzającej. Zdalna
   * nie loguje: konto trzeba najpierw potwierdzić adresem poczty, żeby nie dało się
   * zakładać kont na cudze adresy.
   */
  register(
    loginName: string,
    password: string,
    displayName: string,
  ): Promise<{ ok: true; session?: Session } | { ok: false; reason: string }>;
}

/** Sprawdzanie hasła na urządzeniu użytkownika. Domyślne, dopóki nie ma serwera. */
/* Konta założone w tej przeglądarce. Klucz to nazwa użytkownika pisana małymi literami. */
interface StoredUser {
  credentials: Credentials;
  displayName: string;
  created: number;
}

function readUsers(): Record<string, StoredUser> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredUser>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, StoredUser>): boolean {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch {
    return false;
  }
}

/** Nazwa wyświetlana zalogowanego, jeżeli podał ją przy rejestracji. */
export function displayNameOf(login: string): string | undefined {
  return readUsers()[login]?.displayName;
}

export class LocalAuthProvider implements AuthProvider {
  readonly id = 'local-pbkdf2';
  readonly local = true;

  async login(loginName: string, password: string): Promise<LoginResult> {
    const wait = lockoutSeconds();
    if (wait > 0) return { ok: false, reason: 'blokada', waitSeconds: wait };

    const nazwa = loginName.trim().toLowerCase();

    /* Najpierw konto administratora, wbudowane w aplikację, potem konta założone
     * w tej przeglądarce. Kolejność ma znaczenie: nikt nie może zarejestrować konta
     * o nazwie admin i tą drogą przejąć panelu redakcyjnego. */
    const credentials = nazwa === ADMIN_LOGIN ? currentCredentials() : readUsers()[nazwa]?.credentials;

    /*
     * Gdy konta nie ma, i tak liczymy skrót, na atrapie soli.
     *
     * Bez tego odpowiedź przy nieistniejącej nazwie wracałaby natychmiast, a przy
     * istniejącej po ułamku sekundy potrzebnym na PBKDF2. Różnica jest mierzalna
     * i wystarczyłaby do sprawdzenia, kto ma tu konto, bez znajomości hasła.
     */
    const doSprawdzenia = credentials ?? {
      salt: '00000000000000000000000000000000',
      iterations: 310000,
      hash: '',
    };
    const candidate = await derive(password, fromHex(doSprawdzenia.salt), doSprawdzenia.iterations);

    const loginOk = credentials !== undefined;
    const passwordOk = equalsConstantTime(candidate, doSprawdzenia.hash);

    if (!loginOk || !passwordOk) {
      const attempts = readAttempts();
      const count = attempts.count + 1;
      /* Opóźnienie rośnie wykładniczo od trzeciej nieudanej próby, do pięciu minut. */
      const delay = count < 3 ? 0 : Math.min(300, 2 ** (count - 2));
      writeAttempts({ count, blockedUntil: Date.now() + delay * 1000 });
      return { ok: false, reason: 'dane' };
    }

    writeAttempts({ count: 0, blockedUntil: 0 });
    const role: Role = nazwa === ADMIN_LOGIN ? 'admin' : 'czytelnik';
    return { ok: true, session: { login: nazwa, role, since: Date.now() } };
  }

  /*
   * Założenie konta w tej przeglądarce.
   *
   * Konto istnieje wyłącznie na tym urządzeniu i w tej przeglądarce. Nie ma tu serwera,
   * więc nie ma gdzie go zapisać wspólnie: na drugim komputerze tego konta nie będzie,
   * a wyczyszczenie danych witryny je usunie. Interfejs mówi o tym wprost, bo obietnica
   * konta, które znika po wyczyszczeniu przeglądarki, jest gorsza niż jej brak.
   *
   * Mimo to nie jest to atrapa. Hasło idzie przez ten sam PBKDF2 z solą co konto
   * administratora, więc nie leży nigdzie jawnie, a Ulubione mają po czym rozróżniać
   * użytkowników. Po podpięciu serwera ta sama metoda woła API i konta stają się wspólne.
   */
  async register(
    loginName: string,
    password: string,
    displayName: string,
  ): Promise<{ ok: true; session?: Session } | { ok: false; reason: string }> {
    const nazwa = loginName.trim().toLowerCase();
    if (nazwa.length < 3 || nazwa.length > 32) {
      return { ok: false, reason: 'Nazwa użytkownika musi mieć od 3 do 32 znaków.' };
    }
    if (!/^[a-z0-9._-]+$/.test(nazwa)) {
      return { ok: false, reason: 'Nazwa może zawierać tylko małe litery, cyfry, kropkę, kreskę i podkreślenie.' };
    }
    if (nazwa === ADMIN_LOGIN) {
      return { ok: false, reason: 'Ta nazwa jest zajęta.' };
    }
    const strength = passwordProblems(password);
    if (strength) return { ok: false, reason: strength };

    const uzytkownicy = readUsers();
    if (uzytkownicy[nazwa]) {
      return { ok: false, reason: 'Ta nazwa jest zajęta.' };
    }
    if (Object.keys(uzytkownicy).length >= 50) {
      return { ok: false, reason: 'W tej przeglądarce jest już maksymalna liczba kont.' };
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 310000;
    const hash = await derive(password, salt, iterations);
    uzytkownicy[nazwa] = {
      credentials: { salt: toHex(salt.buffer as ArrayBuffer), iterations, hash },
      displayName: displayName.trim().slice(0, 60) || nazwa,
      created: Date.now(),
    };
    if (!writeUsers(uzytkownicy)) {
      return { ok: false, reason: 'Nie udało się zapisać konta w tej przeglądarce.' };
    }

    return { ok: true, session: { login: nazwa, role: 'czytelnik', since: Date.now() } };
  }

  /*
   * Zmiana hasła zalogowanego użytkownika.
   *
   * Konto, którego dotyczy zmiana, bierzemy z bieżącej sesji, a nie z parametru. Wersja
   * z parametrem kusiła prostotą, ale byłaby dziurą: kto podałby cudzą nazwę, zmieniałby
   * cudze hasło, znając wyłącznie swoje. Sesja jest jedynym miejscem, w którym stoi
   * odpowiedź na pytanie, kto właściwie prosi o zmianę.
   *
   * Poświadczenia administratora leżą pod innym kluczem niż konta zwykłe, bo administrator
   * jest wbudowany w aplikację i istnieje także wtedy, gdy nikt niczego nie zarejestrował.
   * Stąd dwie ścieżki zapisu zamiast jednej.
   */
  async changePassword(
    currentPassword: string,
    nextPassword: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sesja = readSession();
    if (!sesja) return { ok: false, reason: 'Nie jesteś zalogowany.' };

    const strength = passwordProblems(nextPassword);
    if (strength) return { ok: false, reason: strength };

    const uzytkownicy = readUsers();
    const admin = sesja.login === ADMIN_LOGIN;
    const credentials = admin ? currentCredentials() : uzytkownicy[sesja.login]?.credentials;
    if (!credentials) return { ok: false, reason: 'Nie znaleziono konta w tej przeglądarce.' };

    const candidate = await derive(currentPassword, fromHex(credentials.salt), credentials.iterations);
    if (!equalsConstantTime(candidate, credentials.hash)) {
      return { ok: false, reason: 'Obecne hasło jest nieprawidłowe.' };
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 310000;
    const hash = await derive(nextPassword, salt, iterations);
    const nowe: Credentials = { salt: toHex(salt.buffer as ArrayBuffer), iterations, hash };

    if (admin) {
      try {
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(nowe));
      } catch {
        return { ok: false, reason: 'Nie udało się zapisać nowego hasła w tej przeglądarce.' };
      }
      return { ok: true };
    }

    uzytkownicy[sesja.login] = { ...uzytkownicy[sesja.login], credentials: nowe };
    if (!writeUsers(uzytkownicy)) {
      return { ok: false, reason: 'Nie udało się zapisać nowego hasła w tej przeglądarce.' };
    }
    return { ok: true };
  }
}

/* --------------------------------------------------------------- siła hasła */

/*
 * Wymagania wobec hasła.
 *
 * Dwanaście znaków, a nie osiem, bo osiem znaków z pełnym alfabetem łamie się dziś
 * na jednej karcie graficznej w kilka godzin. Wymóg czterech rodzajów znaków jest
 * kompromisem: sam w sobie nie jest najlepszą miarą siły hasła, ale jest miarą,
 * którą użytkownik rozumie i potrafi spełnić, a długość i tak jest tu ważniejsza.
 */
export function passwordProblems(password: string): string | null {
  if (password.length < 12) return 'Hasło musi mieć co najmniej dwanaście znaków.';
  if (!/[a-z]/.test(password)) return 'Hasło musi zawierać małą literę.';
  if (!/[A-Z]/.test(password)) return 'Hasło musi zawierać wielką literę.';
  if (!/[0-9]/.test(password)) return 'Hasło musi zawierać cyfrę.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Hasło musi zawierać znak inny niż litera i cyfra.';
  return null;
}

/*
 * Propozycja hasła.
 *
 * Losowane ze źródła kryptograficznego, nie z Math.random, bo tamto jest przewidywalne
 * i nie nadaje się do niczego, co ma być tajne. Zbiór znaków bez tych, które łatwo
 * pomylić przy przepisywaniu: bez jedynki i małego l, bez zera i wielkiego O.
 */
export function suggestPassword(): string {
  const znaki = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!?#$%&*+-=';
  const losowe = crypto.getRandomValues(new Uint32Array(20));
  return [...losowe].map((n) => znaki[n % znaki.length]).join('');
}

/* ------------------------------------------------------------------- sesja */

/*
 * Sesja w pamięci karty, nie w pamięci trwałej.
 *
 * sessionStorage znika razem z zamknięciem karty, więc na wspólnym komputerze zamknięcie
 * przeglądarki wylogowuje. Przy panelu redakcyjnym jest to zachowanie właściwe, a przy
 * zwykłym koncie kosztuje jedno logowanie dziennie i tyle.
 *
 * Sam zapis nie jest zabezpieczeniem i nigdy nim nie był: przy koncie prowadzonym przez
 * serwer prawdziwym dowodem tożsamości jest żeton, a nie ten wpis. Tutaj leży wyłącznie
 * to, co interfejs musi wiedzieć, żeby pokazać właściwe ekrany.
 */
export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (typeof parsed?.login !== 'string' || typeof parsed?.since !== 'number') return null;
    const role: Role = parsed.role === 'admin' || parsed.role === 'czytelnik' ? parsed.role : 'gosc';
    return { login: parsed.login, role, since: parsed.since };
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Brak dostępu do pamięci nie może przewrócić aplikacji. Sesja zostanie
     * wtedy wyłącznie w pamięci działającej karty. */
  }
}

/*
 * WYBÓR ŹRÓDŁA KONT
 *
 * Aplikacja nie decyduje o tym w kodzie, tylko w konfiguracji, i możliwe są trzy drogi.
 * Wszystkie spełniają ten sam interfejs, więc przejście z jednej na drugą nie wymaga
 * zmiany niczego w interfejsie użytkownika.
 *
 * 1. SUPABASE. Dwie zmienne w .env i konta działają razem z potwierdzaniem adresu
 *    oraz odzyskiwaniem hasła, bo Supabase wysyła wiadomości za nas. Przy projekcie
 *    bez serwera i bez budżetu jest to droga najkrótsza.
 *
 *      VITE_SUPABASE_URL=https://twojprojekt.supabase.co
 *      VITE_SUPABASE_ANON_KEY=eyJ...
 *
 * 2. WŁASNE ZAPLECZE. Jedna zmienna z adresem API zgodnego z server/api.md.
 *    Działającą wersję w PHP razem ze schematem dla MySQL zawiera katalog server.
 *    Wymaga hostingu z PHP i bazą, i osobnego podpięcia wysyłki poczty.
 *
 *      VITE_API_URL=https://astrozenit.pl/api
 *
 * 3. BEZ NICZEGO. Konta powstają w przeglądarce i tam zostają. Do rozejrzenia się
 *    po aplikacji wystarcza, do prawdziwych kont nie.
 *
 * Kolejność sprawdzania jest taka jak wyżej, więc ustawienie obu adresów naraz wybierze
 * Supabase. Kolejność jest jawna, żeby nie było zaskoczeniem, co wygrywa.
 */
const ADRES_SUPABASE = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const KLUCZ_SUPABASE = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const ADRES_ZAPLECZA = (import.meta.env.VITE_API_URL ?? '').trim();

const przezSupabase = ADRES_SUPABASE.length > 0 && KLUCZ_SUPABASE.length > 0;

/** Czy konta są prowadzone przez serwer, czy tylko w tej przeglądarce. */
export const kontaNaSerwerze = przezSupabase || ADRES_ZAPLECZA.length > 0;

export const authProvider: AuthProvider = przezSupabase
  ? new SupabaseAuthProvider({ url: ADRES_SUPABASE, klucz: KLUCZ_SUPABASE })
  : ADRES_ZAPLECZA.length > 0
    ? new RemoteAuthProvider(ADRES_ZAPLECZA)
    : new LocalAuthProvider();
