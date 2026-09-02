/*
 * Dane serwisu pokazywane w sekcji "O projekcie".
 *
 * Wydzielone do osobnego pliku, bo to jedyne miejsce w aplikacji z treścią, której
 * nie da się wyliczyć ani sprawdzić: adresy kontaktowe i odnośniki. Pola zostawione
 * puste po prostu się nie pokażą, więc nic nie jest zmyślone.
 */

export interface ContactChannel {
  label: string;
  /** Treść widoczna dla czytelnika. */
  value: string;
  /**
   * Adres odnośnika. Dozwolone są wyłącznie schematy http, https i mailto.
   * Wartość pusta oznacza kanał do odczytania, ale bez odnośnika.
   */
  href?: string;
}

export interface SiteInfo {
  contact: ContactChannel[];
  /** Odnośniki do innych rzeczy autorów. */
  links: ContactChannel[];
  /**
   * Adres poczty w domenie serwisu. Dopóki jest pusty, sekcja mówi wprost,
   * że domena jest w trakcie zakupu, zamiast pokazywać adres, który nie działa.
   */
  domainEmail: string;
}

export const SITE: SiteInfo = {
  /*
   * Po kupieniu domeny wpisz tu adres, na przykład kontakt@zenit.pl, a poniżej
   * dodaj go do listy kanałów kontaktowych:
   *   { label: 'Poczta', value: SITE.domainEmail, href: `mailto:${SITE.domainEmail}` },
   */
  domainEmail: '',
  contact: [],
  links: [
    {
      label: 'Inne projekty',
      value: 'piotrbanach.site',
      href: 'https://piotrbanach.site/',
    },
  ],
};

/** Odnośnik przepuszczamy tylko wtedy, gdy ma bezpieczny schemat. */
export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}
