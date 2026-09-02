/*
 * Konta prowadzone przez Supabase.
 *
 * Supabase daje bazę PostgreSQL razem z gotowym uwierzytelnianiem: rejestracją,
 * potwierdzaniem adresu, logowaniem i odzyskiwaniem hasła, w tym z wysyłką wiadomości.
 * Przy projekcie bez serwera i bez budżetu to jest różnica rozstrzygająca, bo wysyłka
 * poczty jest tą częścią, której nie da się zrobić w przeglądarce, a bez której konta
 * nie działają do końca: nie da się odzyskać zapomnianego hasła.
 *
 * DLACZEGO BEZ BIBLIOTEKI SUPABASE
 *
 * Oficjalna biblioteka waży około czterdziestu kilobajtów po spakowaniu i wnosi obsługę
 * zapytań do bazy, kanałów czasu rzeczywistego i magazynu plików, z których nic tu nie
 * jest używane. Potrzebne jest sześć wywołań HTTP i tyle właśnie jest w tym pliku.
 * Przy pierwszym wejściu na stronę te czterdzieści kilobajtów byłyby czystą stratą.
 *
 * O PRZECHOWYWANIU ŻETONU, UCZCIWIE
 *
 * Żeton sesji trafia do pamięci przeglądarki, bo przy stronie statycznej nie ma go gdzie
 * indziej trzymać: ciasteczko HttpOnly może ustawić wyłącznie serwer, a serwera tu nie ma.
 * Znaczy to, że pojedynczy błąd prowadzący do wstrzyknięcia kodu na stronę wystarczy do
 * przejęcia sesji. Tak samo działa oficjalna biblioteka Supabase i tak działa większość
 * aplikacji bez zaplecza, ale nazwanie tego wprost jest uczciwsze niż przemilczenie.
 * Wersja z ciasteczkiem jest w server/php i wymaga własnego serwera.
 */

import type { AuthProvider, LoginResult, Session } from './auth';

interface Konfiguracja {
  url: string;
  klucz: string;
}

const KLUCZ_SESJI = 'zenit:supabase';

interface ZapisSesji {
  accessToken: string;
  refreshToken: string;
  wygasa: number;
  login: string;
  displayName: string;
  role: string;
}

function czytajZapis(): ZapisSesji | null {
  try {
    const surowy = localStorage.getItem(KLUCZ_SESJI);
    return surowy ? (JSON.parse(surowy) as ZapisSesji) : null;
  } catch {
    return null;
  }
}

function zapisz(zapis: ZapisSesji | null): void {
  try {
    if (zapis) localStorage.setItem(KLUCZ_SESJI, JSON.stringify(zapis));
    else localStorage.removeItem(KLUCZ_SESJI);
  } catch {
    /* Pamięć zablokowana, na przykład w oknie prywatnym. Sesja przeżyje wtedy
     * do zamknięcia karty i nie ma w tym nic groźnego. */
  }
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase';
  readonly local = false;

  constructor(private readonly config: Konfiguracja) {}

  private async wywolaj(
    sciezka: string,
    init: RequestInit = {},
    zeton?: string,
  ): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const odp = await fetch(`${this.config.url}${sciezka}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        apikey: this.config.klucz,
        ...(zeton ? { authorization: `Bearer ${zeton}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await odp.json()) as Record<string, unknown>;
    } catch {
      /* Odpowiedź 204 nie ma treści i to jest w porządku. */
    }
    return { ok: odp.ok, status: odp.status, body };
  }

  /*
   * Logowanie adresem poczty i hasłem.
   *
   * Interfejs mówi o nazwie użytkownika, a Supabase o adresie poczty, i to nie jest
   * przypadkowa różnica: przy koncie na serwerze tożsamość ustala adres, bo tylko on
   * pozwala odzyskać hasło i potwierdzić, że konto należy do tej osoby.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const wynik = await this.wywolaj('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    if (!wynik.ok) {
      /* Supabase sam ogranicza częstość prób i odpowiada wtedy kodem 429. */
      if (wynik.status === 429) {
        return { ok: false, reason: 'blokada', waitSeconds: 60 };
      }
      return { ok: false, reason: 'dane' };
    }

    const uzytkownik = wynik.body.user as
      | { email?: string; user_metadata?: { display_name?: string }; role?: string }
      | undefined;

    const zapis: ZapisSesji = {
      accessToken: String(wynik.body.access_token ?? ''),
      refreshToken: String(wynik.body.refresh_token ?? ''),
      wygasa: Date.now() + Number(wynik.body.expires_in ?? 3600) * 1000,
      login: uzytkownik?.email ?? email,
      displayName: uzytkownik?.user_metadata?.display_name ?? '',
      role: 'czytelnik',
    };
    zapisz(zapis);

    const session: Session = { login: zapis.login, role: 'czytelnik', since: Date.now() };
    return { ok: true, session };
  }

  /*
   * Rejestracja.
   *
   * Nie loguje od razu, jeżeli w ustawieniach projektu włączone jest potwierdzanie adresu,
   * a powinno być włączone. Bez potwierdzenia da się zakładać konta na cudze adresy,
   * a to zamienia formularz rejestracji w narzędzie do wysyłania niechcianej poczty
   * cudzym nazwiskiem.
   */
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ ok: true; session?: Session } | { ok: false; reason: string }> {
    const wynik = await this.wywolaj('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        data: { display_name: displayName.trim().slice(0, 60) },
      }),
    });

    if (!wynik.ok) {
      const wiadomosc = String(wynik.body.msg ?? wynik.body.message ?? '');
      if (/already registered|user already/i.test(wiadomosc)) {
        /* Odpowiadamy tak samo jak przy powodzeniu. Inaczej formularz stałby się
         * narzędziem do sprawdzania, kto ma konto w serwisie. */
        return { ok: true };
      }
      if (/password/i.test(wiadomosc)) {
        return { ok: false, reason: 'Hasło jest za słabe. Użyj co najmniej dwunastu znaków.' };
      }
      return { ok: false, reason: 'Nie udało się założyć konta. Spróbuj ponownie za chwilę.' };
    }

    /* Gdy potwierdzanie adresu jest wyłączone, Supabase od razu odsyła żeton
     * i wtedy logujemy bez dodatkowego wywołania. */
    const zeton = wynik.body.access_token;
    if (typeof zeton === 'string' && zeton !== '') {
      const zapis: ZapisSesji = {
        accessToken: zeton,
        refreshToken: String(wynik.body.refresh_token ?? ''),
        wygasa: Date.now() + Number(wynik.body.expires_in ?? 3600) * 1000,
        login: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role: 'czytelnik',
      };
      zapisz(zapis);
      return { ok: true, session: { login: zapis.login, role: 'czytelnik', since: Date.now() } };
    }

    return { ok: true };
  }

  async changePassword(
    _currentPassword: string,
    nextPassword: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const zapis = czytajZapis();
    if (!zapis) return { ok: false, reason: 'Nie jesteś zalogowany.' };

    /*
     * Supabase nie wymaga podania obecnego hasła przy zmianie, bo opiera się na trwającej
     * sesji. Formularz i tak o nie pyta i jest to celowe: przejęta sesja nie powinna
     * wystarczyć do zmiany hasła, a sprawdzenie starego hasła robimy sami, logując się
     * nim jeszcze raz przed zmianą.
     */
    const sprawdzenie = await this.wywolaj('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: zapis.login, password: _currentPassword }),
    });
    if (!sprawdzenie.ok) {
      return { ok: false, reason: 'Obecne hasło jest nieprawidłowe.' };
    }

    const wynik = await this.wywolaj(
      '/auth/v1/user',
      { method: 'PUT', body: JSON.stringify({ password: nextPassword }) },
      zapis.accessToken,
    );
    if (!wynik.ok) {
      return { ok: false, reason: 'Nie udało się zmienić hasła. Spróbuj ponownie.' };
    }
    return { ok: true };
  }

  /** Prośba o odzyskanie hasła. Odpowiedź jest zawsze taka sama, żeby nie zdradzać, kto ma konto. */
  async requestReset(email: string): Promise<void> {
    await this.wywolaj('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    }).catch(() => undefined);
  }

  async logout(): Promise<void> {
    const zapis = czytajZapis();
    if (zapis) {
      await this.wywolaj('/auth/v1/logout', { method: 'POST' }, zapis.accessToken).catch(
        () => undefined,
      );
    }
    zapisz(null);
  }

  /** Żeton do wywołań bazy. Odświeża sesję, jeżeli wygasła. */
  async zeton(): Promise<string | null> {
    const zapis = czytajZapis();
    if (!zapis) return null;
    if (Date.now() < zapis.wygasa - 60_000) return zapis.accessToken;

    const wynik = await this.wywolaj('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: zapis.refreshToken }),
    });
    if (!wynik.ok) {
      zapisz(null);
      return null;
    }
    zapisz({
      ...zapis,
      accessToken: String(wynik.body.access_token ?? ''),
      refreshToken: String(wynik.body.refresh_token ?? zapis.refreshToken),
      wygasa: Date.now() + Number(wynik.body.expires_in ?? 3600) * 1000,
    });
    return String(wynik.body.access_token ?? '');
  }
}
