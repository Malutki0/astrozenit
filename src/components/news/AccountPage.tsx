import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Chip, Field, IconButton } from '@/components/ui';
import {
  ADMIN_LOGIN,
  authProvider,
  displayNameOf,
  kontaNaSerwerze,
  lockoutSeconds,
  passwordProblems,
  suggestPassword,
} from '@/lib/auth';
import { formatDateFull, formatTime } from '@/lib/format';
import { usedBytes } from '@/lib/media';
import { loadPosts } from '@/lib/news';
import { useAuthStore } from '@/state/useAuth';

import styles from './News.module.css';

/*
 * Zakładka konta.
 *
 * Zawiera logowanie, rejestrację i zmianę hasła.
 *
 * Stała informacja o ograniczeniach logowania po stronie przeglądarki stąd zniknęła.
 * Nie dlatego, że przestała być prawdą, tylko dlatego, że wisiała na ekranie zawsze,
 * także przy dziesiątym logowaniu, i po pierwszym przeczytaniu była już wyłącznie
 * ścianą tekstu nad formularzem. To samo stoi teraz w polityce prywatności, czyli
 * w miejscu, do którego sięga się wtedy, gdy się o to pyta. Formularz rejestracji
 * zachował krótkie ostrzeżenie, bo tam jest ono decyzją podejmowaną tu i teraz.
 */


/*
 * Logowanie i rejestracja w jednym formularzu.
 *
 * Dwie zakładki zamiast dwóch osobnych ekranów, bo pola są niemal te same, a przełączenie
 * bez utraty wpisanej nazwy oszczędza przepisywania. Domyślnie otwiera się logowanie:
 * osoba, która już ma konto, wraca tu częściej niż ktoś, kto zakłada nowe.
 */
function LoginForm() {
  const { login, register, busy, error, clearError } = useAuthStore();
  const [tryb, setTryb] = useState<'logowanie' | 'rejestracja'>('logowanie');
  const [loginName, setLoginName] = useState(ADMIN_LOGIN);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lockout, setLockout] = useState(() => lockoutSeconds());
  const [udane, setUdane] = useState<string | null>(null);

  /* Odliczanie blokady, żeby użytkownik widział, ile jeszcze zostało. */
  useEffect(() => {
    if (lockout <= 0) return;
    const id = window.setInterval(() => setLockout(lockoutSeconds()), 1000);
    return () => window.clearInterval(id);
  }, [lockout]);

  const przelacz = (nowy: 'logowanie' | 'rejestracja') => {
    setTryb(nowy);
    setPassword('');
    setPassword2('');
    setUdane(null);
    clearError();
    /* Przy przejściu do rejestracji czyścimy podpowiedzianą nazwę administratora,
     * bo jest zajęta i zostawiona w polu tylko myli. */
    if (nowy === 'rejestracja' && loginName === ADMIN_LOGIN) setLoginName('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setUdane(null);
    if (tryb === 'logowanie') {
      const ok = await login(loginName, password);
      if (!ok) {
        setPassword('');
        setLockout(lockoutSeconds());
      }
      return;
    }
    const ok = await register(loginName, password, displayName);
    if (ok) {
      setPassword('');
      setPassword2('');
      setUdane('Konto założone. Jesteś zalogowany.');
    }
  };

  const hasloNiezgodne = tryb === 'rejestracja' && password2.length > 0 && password !== password2;
  const gotowe =
    tryb === 'logowanie'
      ? Boolean(password) && lockout === 0
      : Boolean(loginName && password && password2) && !hasloNiezgodne;

  return (
    <form className={styles.editor} onSubmit={submit}>
      <div className={styles.authTabs} role="tablist" aria-label="Logowanie albo rejestracja">
        <button
          type="button"
          role="tab"
          aria-selected={tryb === 'logowanie'}
          className={`${styles.authTab} ${tryb === 'logowanie' ? styles.authTabActive : ''}`}
          onClick={() => przelacz('logowanie')}
        >
          Mam konto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tryb === 'rejestracja'}
          className={`${styles.authTab} ${tryb === 'rejestracja' ? styles.authTabActive : ''}`}
          onClick={() => przelacz('rejestracja')}
        >
          Zakładam konto
        </button>
      </div>

      <Field
        label="Nazwa użytkownika"
        value={loginName}
        autoComplete="username"
        hint={
          tryb === 'rejestracja'
            ? 'Od 3 do 32 znaków: małe litery, cyfry, kropka, kreska, podkreślenie.'
            : undefined
        }
        onChange={(e) => {
          setLoginName(e.target.value);
          setUdane(null);
          clearError();
        }}
      />

      {tryb === 'rejestracja' && (
        <Field
          label="Nazwa wyświetlana"
          value={displayName}
          autoComplete="nickname"
          hint="Nieobowiązkowa. Tak podpisane będą twoje obserwacje w Ulubionych."
          onChange={(e) => setDisplayName(e.target.value)}
        />
      )}

      <Field
        label="Hasło"
        type="password"
        value={password}
        autoComplete={tryb === 'logowanie' ? 'current-password' : 'new-password'}
        /* Pełna lista wymagań od razu, a nie odkrywana po jednym przy kolejnych próbach.
         * Reguły są te same, które sprawdza passwordProblems, więc nie ma tu miejsca
         * na rozjazd między tym, co obiecuje podpowiedź, a tym, co przechodzi. */
        hint={
          tryb === 'rejestracja'
            ? 'Co najmniej 12 znaków, w tym mała i wielka litera, cyfra oraz znak specjalny.'
            : undefined
        }
        onChange={(e) => {
          setPassword(e.target.value);
          setUdane(null);
          clearError();
        }}
        error={tryb === 'logowanie' ? (error ?? undefined) : undefined}
      />

      {tryb === 'rejestracja' && (
        <Field
          label="Powtórz hasło"
          type="password"
          value={password2}
          autoComplete="new-password"
          onChange={(e) => {
            setPassword2(e.target.value);
            clearError();
          }}
          error={hasloNiezgodne ? 'Hasła się różnią.' : (error ?? undefined)}
        />
      )}

      <div>
        <Button variant="primary" type="submit" loading={busy} disabled={!gotowe}>
          {busy
            ? 'Chwileczkę'
            : tryb === 'rejestracja'
              ? 'Załóż konto'
              : lockout > 0
                ? `Odczekaj ${lockout} s`
                : 'Zaloguj się'}
        </Button>
      </div>

      {udane && <p className={styles.authOk}>{udane}</p>}

      {/*
        * Jedno zdanie o tym, gdzie konto powstaje, i tylko gdy powstaje w przeglądarce.
        *
        * Wcześniej stał tu bursztynowy blok na kilka linijek, przy każdej rejestracji,
        * także po podpięciu serwera. Był nie na miejscu z dwóch powodów: zajmował więcej
        * uwagi niż sam formularz, a po podpięciu zaplecza mówiłby nieprawdę. Teraz znika
        * sam, gdy konta idą na serwer, bo wtedy nie ma o czym uprzedzać.
        */}
      {tryb === 'rejestracja' && !kontaNaSerwerze && (
        <p className={styles.authNote}>
          Zaplecze kont nie jest jeszcze podpięte, więc konto zapisze się w tej
          przeglądarce. Hasło idzie przez PBKDF2 z solą i nigdy nie jest zapisywane jawnie.
        </p>
      )}

    </form>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== repeat) {
      setMessage({ ok: false, text: 'Powtórzone hasło nie zgadza się z nowym.' });
      return;
    }
    setBusy(true);
    const result = await authProvider.changePassword(current, next);
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: 'Hasło zmienione. Zapamiętaj je, nie da się go odtworzyć.' });
      setCurrent('');
      setNext('');
      setRepeat('');
    } else {
      setMessage({ ok: false, text: result.reason });
    }
  };

  const problem = next ? passwordProblems(next) : null;

  return (
    <form className={styles.editor} onSubmit={submit}>
      <Field
        label="Obecne hasło"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="Nowe hasło"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={problem ?? undefined}
        hint="Co najmniej dwanaście znaków, w tym mała i wielka litera, cyfra oraz znak specjalny."
      />
      <Field
        label="Powtórz nowe hasło"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary" type="submit" loading={busy} disabled={!current || !next || Boolean(problem)}>
          Zmień hasło
        </Button>
        <Button
          type="button"
          onClick={() => {
            const generated = suggestPassword();
            setNext(generated);
            setRepeat(generated);
            setMessage({ ok: true, text: `Podpowiedziane hasło: ${generated}` });
          }}
        >
          Zaproponuj mocne hasło
        </Button>
      </div>
      {message && (
        <p className={message.ok ? styles.note : styles.noteError} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const [stats, setStats] = useState<{ posts: number; bytes: number } | null>(null);

  useEffect(() => {
    if (!session) return;
    void usedBytes().then((bytes) => setStats({ posts: loadPosts().length, bytes }));
  }, [session]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div style={{ minWidth: 0 }}>
            <span className={styles.eyebrow}>Konto</span>
            <h1 className={styles.pageTitle}>{session ? 'Zalogowany' : 'Konto'}</h1>
            {/*
              * Opis zależny od roli.
              *
              * Wcześniej każdy zalogowany czytał, że ma dostęp do panelu redakcyjnego, także
              * czytelnik, który dostępu nie ma. Aplikacja blokowała go poprawnie, ale mówiła
              * co innego, niż robiła, a to jest gorsze niż sama blokada: użytkownik wyciąga
              * z tego wniosek, że coś się popsuło.
              */}
            <p className={styles.lede}>
              {!session
                ? 'Załóż konto, żeby zbierać obiekty w Ulubionych. Czytanie aktualności konta nie wymaga.'
                : session.role === 'admin'
                  ? 'Masz dostęp do panelu redakcyjnego. Sesja kończy się po zamknięciu karty albo po ośmiu godzinach.'
                  : 'Konto czytelnika: zbierasz obiekty w Ulubionych. Sesja kończy się po zamknięciu karty.'}
            </p>
          </div>
          <div className={styles.actions}>
            <IconButton icon="close" label="Wróć na mapę nieba" bordered onClick={() => navigate('/')} />
          </div>
        </div>

        {session ? (
          <div className={styles.editor}>
            <div className={styles.accountCard}>
              <div className={styles.accountRow}>
                <span className={styles.accountAvatar} aria-hidden="true">
                  {session.login.slice(0, 1).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className={styles.accountName}>{displayNameOf(session.login) ?? session.login}</p>
                  <p className={styles.accountMeta}>
                    Zalogowano {formatDateFull(new Date(session.since))} o {formatTime(new Date(session.since))}
                  </p>
                </div>
                {/* Odznaka i przycisk panelu zależne od roli. Wpisane na sztywno mówiły
                  * każdemu zalogowanemu, że jest administratorem, i podsuwały mu przycisk
                  * do panelu, który i tak by go nie wpuścił. */}
                <Chip tone={session.role === 'admin' ? 'accent' : 'neutral'} dot>
                  {session.role === 'admin' ? 'administrator' : 'czytelnik'}
                </Chip>
              </div>
              {stats && session.role === 'admin' && (
                <p className={styles.accountMeta}>
                  Wpisów: {stats.posts}. Zdjęcia zajmują {(stats.bytes / 1048576).toFixed(1)} MB
                  w bazie tej przeglądarki.
                </p>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {session.role === 'admin' ? (
                  <Button variant="primary" icon="plus" onClick={() => navigate('/aktualnosci/panel')}>
                    Panel redakcyjny
                  </Button>
                ) : (
                  <Button variant="primary" icon="star" onClick={() => navigate('/ulubione')}>
                    Moje ulubione
                  </Button>
                )}
                <Button onClick={logout}>Wyloguj się</Button>
              </div>
            </div>

            <div>
              <p className={styles.eyebrow}>Zmiana hasła</p>
              <ChangePasswordForm />
            </div>
          </div>
        ) : (
          <div className={styles.editor}>
            <LoginForm />
          </div>
        )}
      </div>
    </div>
  );
}
