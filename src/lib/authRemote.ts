/*
 * Uwierzytelnianie po stronie serwera.
 *
 * Gotowa implementacja interfejsu AuthProvider, czekająca na adres zaplecza. Kontrakt,
 * który po drugiej stronie trzeba spełnić, jest opisany w server/api.md, a schemat bazy
 * w server/schema.sql.
 *
 * Włączenie sprowadza się do zmiany jednej linii na końcu src/lib/auth.ts:
 *
 *   export const authProvider: AuthProvider = new RemoteAuthProvider('https://api.twoja.pl');
 *
 * Dwie decyzje w tym pliku wymagają uzasadnienia, bo można je łatwo cofnąć przez nieuwagę.
 *
 * Pierwsza: sesja jedzie w ciasteczku, a nie w nagłówku, i klient nigdy nie widzi tokenu.
 * Token trzymany w pamięci przeglądarki jest odczytywalny przez każdy skrypt na stronie,
 * więc pojedynczy błąd prowadzący do wstrzyknięcia kodu oznacza przejęcie wszystkich sesji.
 * Ciasteczko z atrybutem HttpOnly jest dla skryptów niewidoczne. Dlatego każde zapytanie
 * idzie z credentials równym include, a w kodzie nie ma ani jednego miejsca, w którym
 * token byłby zapisywany albo odczytywany.
 *
 * Druga: przy błędzie sieci nie ma cichego przejścia na sprawdzanie lokalne. Zapasowe
 * logowanie w przeglądarce byłoby furtką omijającą całe zaplecze, wystarczyłoby odciąć
 * połączenie z serwerem. Lepiej powiedzieć, że logowanie jest chwilowo niedostępne.
 */

import type { AuthProvider, LoginResult, Role, Session } from './auth';

interface ServerUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
}

interface ServerError {
  error: string;
  message?: string;
}

/** Role z serwera przepuszczamy przez własną listę, żeby nie ufać cudzemu polu tekstowemu. */
function toRole(value: string): Role {
  return value === 'admin' || value === 'czytelnik' ? value : 'czytelnik';
}

export class RemoteAuthProvider implements AuthProvider {
  readonly id = 'remote';
  readonly local = false;

  constructor(private readonly baseUrl: string) {}

  private async call<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; body: ServerError }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      /* Bez tego przeglądarka nie wyśle ciasteczka sesji na inną domenę. */
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });

    if (response.status === 204) return { ok: true, data: undefined as T };

    const body = (await response.json().catch(() => ({}))) as T & ServerError;
    if (!response.ok) {
      return { ok: false, status: response.status, body: body as ServerError };
    }
    return { ok: true, data: body as T };
  }

  async login(loginName: string, password: string): Promise<LoginResult> {
    try {
      const result = await this.call<{ user: ServerUser }>('/api/logowanie', {
        method: 'POST',
        body: JSON.stringify({ email: loginName.trim(), password }),
      });

      if (!result.ok) {
        if (result.body.error === 'blokada') {
          return { ok: false, reason: 'blokada' };
        }
        return { ok: false, reason: 'dane' };
      }

      const user = result.data.user;
      return {
        ok: true,
        session: {
          login: user.displayName || user.email,
          role: toRole(user.role),
          since: Date.now(),
        },
      };
    } catch {
      /* Brak połączenia nie może otwierać drogi na skróty. */
      return { ok: false, reason: 'dane' };
    }
  }

  async changePassword(
    currentPassword: string,
    nextPassword: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const result = await this.call('/api/haslo/zmiana', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, password: nextPassword }),
      });
      if (result.ok) return { ok: true };
      return {
        ok: false,
        reason: result.body.message ?? 'Nie udało się zmienić hasła.',
      };
    } catch {
      return { ok: false, reason: 'Brak połączenia z serwerem.' };
    }
  }

  /** Rejestracja nowego konta. Nie loguje: konto trzeba najpierw potwierdzić adresem poczty. */
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const result = await this.call('/api/rejestracja', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, displayName: displayName.trim() }),
      });
      if (result.ok) return { ok: true };
      return { ok: false, reason: result.body.message ?? 'Nie udało się założyć konta.' };
    } catch {
      return { ok: false, reason: 'Brak połączenia z serwerem.' };
    }
  }

  /** Prośba o odzyskanie hasła. Odpowiedź jest zawsze taka sama, żeby nie zdradzać, kto ma konto. */
  async requestReset(email: string): Promise<void> {
    await this.call('/api/haslo/reset', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => undefined);
  }

  /** Odtworzenie sesji po odświeżeniu strony. Ciasteczko jedzie samo. */
  async currentSession(): Promise<Session | null> {
    try {
      const result = await this.call<{ user: ServerUser }>('/api/ja');
      if (!result.ok) return null;
      const user = result.data.user;
      return {
        login: user.displayName || user.email,
        role: toRole(user.role),
        since: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    await this.call('/api/wylogowanie', { method: 'POST' }).catch(() => undefined);
  }
}
