import { create } from 'zustand';

import { authProvider, readSession, writeSession, type Session } from '@/lib/auth';

interface AuthState {
  session: Session | null;
  /** Trwa sprawdzanie hasła. Wyprowadzenie skrótu zajmuje ułamek sekundy. */
  busy: boolean;
  error: string | null;
  login: (loginName: string, password: string) => Promise<boolean>;
  register: (loginName: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

/*
 * Stan zalogowania.
 *
 * Sesja jest odczytywana z pamięci karty przy starcie, więc odświeżenie strony
 * nie wylogowuje, ale zamknięcie karty już tak. Przy panelu redakcyjnym to
 * właściwe zachowanie, zwłaszcza na wspólnym komputerze.
 */
export const useAuthStore = create<AuthState>((set) => ({
  session: readSession(),
  busy: false,
  error: null,

  login: async (loginName, password) => {
    set({ busy: true, error: null });
    const result = await authProvider.login(loginName, password);
    if (result.ok) {
      writeSession(result.session);
      set({ session: result.session, busy: false, error: null });
      return true;
    }
    set({
      busy: false,
      error:
        result.reason === 'blokada'
          ? `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${result.waitSeconds} sekund.`
          : 'Nieprawidłowa nazwa użytkownika albo hasło.',
    });
    return false;
  },

  /*
   * Założenie konta.
   *
   * Implementacja lokalna od razu loguje, bo nie ma jak wysłać wiadomości potwierdzającej.
   * Zdalna zwróci powodzenie bez sesji, bo konto czeka na potwierdzenie adresu. Oba
   * przypadki obsługujemy tu, żeby po podpięciu serwera nie trzeba było ruszać interfejsu.
   */
  register: async (loginName, password, displayName) => {
    set({ busy: true, error: null });
    const result = await authProvider.register(loginName, password, displayName);
    if (!result.ok) {
      set({ busy: false, error: result.reason });
      return false;
    }
    if (result.session) {
      writeSession(result.session);
      set({ session: result.session, busy: false, error: null });
    } else {
      set({ busy: false, error: null });
    }
    return true;
  },

  logout: () => {
    writeSession(null);
    set({ session: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export const useSession = () => useAuthStore((s) => s.session);
export const useIsAdmin = () => useAuthStore((s) => s.session?.role === 'admin');
