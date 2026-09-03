/*
 * Pobieranie aktualności astronomicznych.
 *
 * Skrypt zbiera wpisy z kanałów RSS, porządkuje je i zapisuje do public/data/news.json,
 * skąd czyta je aplikacja. Uruchamiany ręcznie poleceniem `npm run fetch:news`, a na
 * hostingu przez harmonogram, który raz na dobę uruchamia go ponownie i wypycha wynik.
 *
 * ŹRÓDŁA I PRAWA AUTORSKIE
 *
 * Nie wszystkie źródła wolno traktować tak samo i to jest najważniejsza decyzja w tym pliku.
 *
 * NASA. Teksty napisane przez pracowników agencji są w Stanach Zjednoczonych dobrem
 * publicznym, więc wolno je tłumaczyć i publikować, podając autora. Zdjęcia w większości
 * też, ale nie wszystkie: NASA wstawia do swoich artykułów prace astrofotografów, które
 * ma na własnej licencji i których dalej rozpowszechniać nie wolno. Poznać je po nazwie
 * pliku, bo agencja zapisuje w niej nazwisko i adnotację o zgodzie. Takie zdjęcia
 * odrzucamy, zamiast zakładać, że skoro leżą na serwerze NASA, to są wolne.
 *
 * AstroNET. Serwis polski, treści objęte pełnym prawem autorskim. Bierzemy wyłącznie to,
 * co kanał RSS udostępnia właśnie w tym celu: tytuł, krótką zajawkę i odnośnik. Ani całych
 * tekstów, ani zdjęć. Czytelnik dostaje informację, że coś się wydarzyło, i przechodzi
 * do źródła, które na tym zarabia. To jest zwykłe zestawienie odnośników, a nie przedruk.
 *
 * Czego tu nie ma i dlaczego. Sprawdzałem tvn24: kanał ogólny zawiera dwadzieścia kilka
 * wpisów dziennie, z czego astronomii dotyczy zwykle żaden albo jeden, a strona z tagiem
 * astronomia własnego kanału nie ma. Dokładanie źródła, które w typowej dobie nie wnosi
 * nic, kosztuje czas pobierania i daje fałszywe wrażenie szerokiego przeglądu.
 *
 * TŁUMACZENIE
 *
 * Wpisy NASA są po angielsku, a cała aplikacja po polsku. Jeżeli w środowisku jest klucz
 * ANTHROPIC_API_KEY, skrypt prosi model o przekład tytułu i zajawki. Jeżeli klucza nie ma
 * albo usługa odpowie błędem, wpis zostaje po angielsku i dostaje o tym znacznik. To jest
 * świadome: lepiej pokazać wiadomość w oryginale niż nie pokazać jej wcale, i lepiej,
 * żeby brak klucza był widoczny niż żeby po cichu wywracał całe pobieranie.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KATALOG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WYJSCIE = resolve(KATALOG, 'public/data/news.json');

/* Serwisy proszą w regulaminach o przedstawienie się. Adres pozwala się z nami skontaktować,
 * gdyby pobieranie komuś przeszkadzało, zamiast po prostu blokować nieznanego klienta. */
const UA = 'AstroZenit/1.0 (aplikacja astronomiczna; kontakt: kontakt@astrozenit.pl)';

/** Ile wpisów zostawiamy w pliku. Więcej nikt nie przewinie, a plik rośnie. */
const LIMIT = 24;

/* --------------------------------------------------------------- pobieranie */

async function pobierz(url, timeout = 25000) {
  const przerwij = new AbortController();
  const budzik = setTimeout(() => przerwij.abort(), timeout);
  try {
    const odp = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' },
      signal: przerwij.signal,
    });
    if (!odp.ok) throw new Error(`odpowiedź ${odp.status}`);
    return await odp.text();
  } finally {
    clearTimeout(budzik);
  }
}

/* ------------------------------------------------------------ rozbiór RSS */

function odkoduj(tekst) {
  return tekst
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '„')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&nbsp;/g, ' ')
    /* Encje liczbowe zapisane wprost. WordPress, na którym stoją oba kanały, zamienia
     * w tytułach półpauzy i apostrofy właśnie na taki zapis, i bez tego kroku trafiały
     * one na stronę jako surowe &#8211; zamiast znaku. */
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function pole(wpis, nazwa) {
  const m = wpis.match(new RegExp(`<${nazwa}[^>]*>([\\s\\S]*?)</${nazwa}>`));
  return m ? odkoduj(m[1]).trim() : '';
}

/** Zdejmuje znaczniki i zbija białe znaki, żeby zajawka była jednym akapitem. */
function naTekst(html) {
  return odkoduj(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function rozbierz(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, wpis]) => ({
    title: naTekst(pole(wpis, 'title')),
    link: pole(wpis, 'link'),
    date: pole(wpis, 'pubDate'),
    description: pole(wpis, 'description'),
    content: pole(wpis, 'content:encoded'),
    categories: [...wpis.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map(([, c]) =>
      odkoduj(c).trim(),
    ),
  }));
}

/* --------------------------------------------------------------- zdjęcia */

/*
 * Nazwy plików, których nie wolno użyć.
 *
 * NASA zapisuje w nazwie pliku informację o pochodzeniu zdjęcia, na przykład
 * "Harvest Moon_212_Mike Linnihan_Used with Permission.jpg". Adnotacja o zgodzie znaczy,
 * że zgodę ma NASA, a nie każdy, kto to zdjęcie zobaczy. Sprawdzenie jest proste i z góry
 * ostrożne: przy wątpliwości wpis zostaje bez zdjęcia, a nie ze zdjęciem cudzym.
 */
const ZASTRZEZONE =
  /used.{0,3}with.{0,3}permission|courtesy|all.{0,3}rights|copyright|%C2%A9|©/i;

function wybierzZdjecie(html) {
  const zrodla = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(([, s]) => odkoduj(s));
  for (const surowy of zrodla) {
    const url = surowy.split('?')[0];
    if (!/^https:\/\//.test(url)) continue;
    if (!/\.(jpe?g|png|webp)$/i.test(url)) continue;
    if (ZASTRZEZONE.test(surowy)) continue;
    /* Gdy artykuł nie ma własnej ilustracji, redakcja wstawia logo agencji albo baner
     * działu. Jako zdjęcie otwierające wpis to nic nie pokazuje, więc szukamy dalej,
     * a jak nic nie znajdziemy, karta zostaje bez obrazu. */
    if (/meatball|logo|banner|placeholder|thumbnail_default|social[-_]share/i.test(url)) continue;
    /* Prosimy o wersję o rozsądnej szerokości. Serwer NASA skaluje obraz na żądanie,
     * więc nie ma powodu ściągać czytelnikowi pliku o boku dwóch tysięcy pikseli. */
    return `${url}?w=1200&fit=clip`;
  }
  return undefined;
}

/*
 * Pełna treść wpisu, złożona z akapitów.
 *
 * Bierzemy wyłącznie zawartość znaczników akapitu i tylko taką, która ma więcej niż
 * sześćdziesiąt znaków. Krótsze akapity w tych kanałach to podpisy pod zdjęciami, pozycje
 * menu i przyciski udostępniania, czyli rzeczy, które w tekście artykułu wyglądają jak
 * śmieci. Próg jest zgrubny i czasem utnie krótkie zdanie, ale odwrotny błąd, czyli
 * wpuszczenie do treści słów "Share" i "Read More", jest dużo bardziej widoczny.
 *
 * Treść pobieramy tylko dla NASA. Do tekstów agencji mamy prawo, bo są dobrem publicznym,
 * i wolno je u siebie opublikować. Do tekstów AstroNETu nie mamy i tam zostają tytuł,
 * zajawka oraz odnośnik. Rozróżnienie robi wywołujący, przez parametr, żeby nie dało się
 * go przeoczyć przy dokładaniu kolejnego źródła.
 */
/*
 * Akapity, które nie są treścią.
 *
 * Kanał przysyła całą stronę artykułu, razem z jej ogonem: metryczką "Details Last Updated",
 * listą powiązanych haseł, blokiem kontaktowym z telefonem i adresem pocztowym redaktora,
 * zachętą do zapisania się na newsletter i zajawkami trzech innych tekstów. Zostawione tak,
 * jak przyszły, robią z artykułu śmietnik, a przy tłumaczeniu jeszcze za nie płacimy.
 *
 * Wszystko to zaczyna się w przewidywalnym miejscu, więc tniemy tekst na pierwszym akapicie
 * pasującym do wzorca i wyrzucamy pojedyncze akapity służbowe rozsiane wyżej.
 */
const OGON = /^(Details Last Updated|Get the latest from NASA|Learn more about|For more information|Keep Exploring|Explore More|Share Details|By [A-Z][a-z]+ [A-Z])/;
const SLUZBOWY = /@nasa\.gov|^\d{3}-\d{3}-\d{4}|Subscribe here|Related Terms/;

function tresc(html) {
  const akapity = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, p]) => naTekst(p).replace(REGULKA, '').trim())
    /*
     * Próg długości. Krótsze akapity w tych kanałach to podpisy pod zdjęciami, pozycje menu
     * i przyciski udostępniania, czyli rzeczy, które w tekście artykułu wyglądają jak śmieci.
     * Próg jest zgrubny i czasem utnie krótkie zdanie, ale odwrotny błąd, czyli wpuszczenie
     * do treści słów "Share" i "Read More", jest dużo bardziej widoczny.
     */
    .filter((t) => t.length > 60);

  const koniec = akapity.findIndex((t) => OGON.test(t));
  const tresciwe = (koniec === -1 ? akapity : akapity.slice(0, koniec))
    .filter((t) => !SLUZBOWY.test(t))
    /* Redakcja NASA powtarza czasem ten sam akapit dwa razy pod rząd, na przykład zdanie
     * o kolejnym numerze spaceru kosmicznego. W przedruku wygląda to na naszą usterkę. */
    .filter((t, i, lista) => t !== lista[i - 1]);
  return tresciwe.length ? tresciwe.join('\n\n').slice(0, 12000) : undefined;
}

/* ------------------------------------------------------------ kwalifikacja */

/*
 * Przypisanie do jednej z pięciu kategorii aplikacji.
 *
 * Kanały mają własne, znacznie drobniejsze podziały, i to na dodatek każdy inny. Zamiast
 * odwzorowywać oba słowniki, patrzymy na słowa w tytule i w kategoriach źródła. Kolejność
 * ma znaczenie: pierwsze dopasowanie wygrywa, więc reguły węższe stoją przed szerszymi.
 */
const REGULY = [
  ['wydarzenie', /skywatching|skywatch|what'?s up|apod|eclipse|meteor|conjunction|equinox|solstice|zaćmieni|rój|koniunkcj|perygeum|opozycj|na niebie|obserwacj|przesileni|równonoc/i],
  ['teleskop', /telescope|webb|hubble|chandra|spitzer|kepler|\bvlt\b|observatory|teleskop|obserwatorium|zwierciadł|interferometr/i],
  ['sprzet', /engine|rocket|booster|launch vehicle|instrument|hardware|payload|silnik|rakiet|napęd|osprzęt|ładunek|lornetk|okular|montaż/i],
  ['misja', /mission|crew|astronaut|spacewalk|station|artemis|rover|lander|orbiter|flyby|selects|contract|provider|misj|załog|astronaut|stacj|sonda|łazik|lądownik|przelot|start rakiety/i],
  ['odkrycie', /discover|found|research|study|reveal|measure|survey|odkry|badani|naukowc|wykry|zmierzy|przegląd/i],
];

function kategoria(tytul, kategorieZrodla) {
  const tekst = `${tytul} ${kategorieZrodla.join(' ')}`;
  for (const [nazwa, wzorzec] of REGULY) if (wzorzec.test(tekst)) return nazwa;
  return 'odkrycie';
}

/*
 * Kwalifikacja wpisu.
 *
 * Pierwsza wersja przepuszczała wszystko, co nie było jawnie odrzucone, i wymagała, żeby
 * wpis miał choć jedną kategorię. Obie decyzje okazały się złe. Do aplikacji weszły susza
 * w Portoryko, ogłoszenie o naborze wniosków na badania lodowców i zaproszenie na warsztaty,
 * bo formalnie są to wiadomości naukowe NASA z kategoriami. Wypadły za to informacje
 * o silnikach Artemis III i o lądowniku księżycowym, bo redakcja nie przypisała im kategorii.
 *
 * Teraz jest odwrotnie: wpis musi sam się wykazać. Musi trafić w listę haseł astronomicznych
 * w tytule albo w kategoriach i nie może trafić w listę odrzucającą. Sito jest przez to
 * ciaśniejsze i czasem odrzuci wiadomość na temat. To jest wybór świadomy, bo w aplikacji
 * do obserwacji nieba jedna wiadomość o suszy kosztuje więcej zaufania, niż zyskuje się
 * na dziesięciu wiadomościach o lądownikach.
 */
const DOPUSZCZA =
  /moon|lunar|sun\b|solar|planet|mars|venus|jupiter|saturn|neptun|uranus|mercury|pluto|asteroid|comet|meteor|eclipse|star|galax|nebula|black hole|exoplanet|universe|cosmic|astronom|astrophysic|telescope|observator|hubble|webb|chandra|apod|skywatch|spacecraft|orbit|astronaut|spacewalk|space station|\biss\b|artemis|rocket|launch|lander|rover|probe|mission|aurora|milky way|supernova|księżyc|słońc|planet|gwiazd|galakt|kometa|meteor|zaćmieni|teleskop|rakiet|sonda|łazik|misj|kosmos|kosmiczn/i;

/*
 * Wpisy odrzucane, sprawdzane po dopuszczeniu.
 *
 * W kanale NASA obok astronomii idą sprawy naukowe o Ziemi, ogłoszenia o konkursach
 * grantowych i życie ośrodków badawczych, z zapisami na madżonga w klubie pracowniczym
 * włącznie. W kanale AstroNETu obok astronomii idzie astroekonomia, czyli poradniki
 * inwestycyjne. Wszystko to jest w swoim miejscu na miejscu i nie ma czego szukać tutaj.
 */
const ODPADA =
  /earth observatory|drought|cryospher|glacier|sea ice|wildfire|hurricane|climate|\broses\b|amendment|solicit|proposal|workshop|symposium|mahjong|yoga|employee|internship|job opening|nabór|konkurs|webinar|szkoleni|astroekonomi|\betf\b|inwestow|giełd|kryptowalut/i;

function przydatny(wpis) {
  if (!wpis.title || !wpis.link) return false;
  const tekst = `${wpis.title} ${wpis.categories.join(' ')}`;
  if (ODPADA.test(tekst)) return false;
  return DOPUSZCZA.test(tekst);
}

/* ------------------------------------------------------------- tłumaczenie */

/*
 * Przekład na polski przez model językowy.
 *
 * Prosimy wyłącznie o tytuł i zajawkę, w jednej rozmowie dla całej paczki, bo tak jest
 * i taniej, i spójniej stylistycznie. Model dostaje wprost zakaz używania długiego myślnika,
 * bo cała aplikacja go nie używa, a poprawianie tego po fakcie w tekście pobranym z sieci
 * byłoby najłatwiejszym miejscem na wyciek tego znaku do projektu.
 */
async function przetlumacz(wpisy, poprzednie) {
  /*
   * Pamięć przekładów.
   *
   * Kanał NASA trzyma dziesięć wpisów i między jednym uruchomieniem a drugim zmienia się
   * zwykle jeden albo dwa. Bez pamięci płacilibyśmy codziennie za przetłumaczenie tych
   * samych ośmiu tekstów od nowa, a przy pełnych treściach to już realne pieniądze.
   *
   * Pamięć robi jeszcze jedno, ważniejsze. Uruchomienie bez klucza nie kasuje polszczyzny:
   * wpisy przetłumaczone wcześniej zostają po polsku, a po angielsku zostają tylko te,
   * których nigdy nie udało się przetłumaczyć. Bez tego jedno uruchomienie bez klucza
   * cofałoby cały serwis do angielskiego.
   */
  const zapamietane = new Map(
    (poprzednie?.posts ?? [])
      .filter((p) => p.translated && p.language === 'pl')
      .map((p) => [p.id, p]),
  );
  /*
   * Zapamiętany przekład, któremu brakuje treści, a świeży wpis treść ma, jest już
   * nieaktualny: powstał, zanim zaczęliśmy pobierać pełne teksty. Wyrzucamy go z pamięci,
   * żeby wpis poszedł do tłumaczenia jeszcze raz, bo inaczej polski tytuł zostałby
   * doklejony do pustej treści i wpis udawałby, że nie ma czego czytać.
   */
  for (const w of wpisy) {
    const stary = zapamietane.get(w.id);
    if (stary && w.body && !stary.body) zapamietane.delete(w.id);
  }
  const doPrzekladu = wpisy.filter((w) => !zapamietane.has(w.id));
  const zPamieci = (w) => {
    const stary = zapamietane.get(w.id);
    return stary ? { ...w, title: stary.title, lead: stary.lead, body: stary.body, language: 'pl', translated: true } : w;
  };

  if (!doPrzekladu.length) {
    console.log(`wszystkie ${wpisy.length} już przetłumaczone wcześniej`);
    return wpisy.map(zPamieci);
  }

  const klucz = process.env.ANTHROPIC_API_KEY;
  if (!klucz) {
    console.log(
      `  ANTHROPIC_API_KEY nie ustawiony, ${doPrzekladu.length} nowych wpisów zostaje po angielsku`,
    );
    return wpisy.map(zPamieci);
  }

  /*
   * Tłumaczymy po jednym wpisie, a nie całą paczkę naraz.
   *
   * Przy tytułach i zajawkach jedna rozmowa dla wszystkiego była tańsza. Po dołożeniu
   * pełnych tekstów paczka urosła do kilkunastu tysięcy znaków i pojedynczy błąd, choćby
   * urwana odpowiedź, przewracał przekład wszystkich wpisów naraz. Osobne wywołania
   * kosztują tyle samo żetonów, a psują się pojedynczo: nieudany wpis zostaje po angielsku,
   * reszta jest po polsku.
   */
  const gotowe = [];
  for (const wpis of wpisy) {
    if (zapamietane.has(wpis.id)) {
      gotowe.push(zPamieci(wpis));
      continue;
    }
    gotowe.push(await przetlumaczWpis(wpis, klucz));
  }
  return gotowe;
}

async function przetlumaczWpis(wpis, klucz) {
  const polecenie = [
    'Przetłumacz na polski wiadomość astronomiczną.',
    '',
    'Zasady:',
    '- naturalna polszczyzna, nie kalka z angielskiego,',
    '- nazwy misji, instrumentów i firm zostaw w oryginale (Artemis, Blue Origin, Webb),',
    '- jednostki przelicz na metryczne tam, gdzie są imperialne,',
    '- NIE UŻYWAJ znaku długiego myślnika. Zamiast niego przecinek, dwukropek albo nawias,',
    '- zajawka: jedno albo dwa zdania, najwyżej 240 znaków,',
    '- treść: zachowaj podział na akapity, akapity rozdzielaj pustym wierszem,',
    '- nie dopisuj niczego od siebie i nie streszczaj, tłumacz to, co jest.',
    '',
    'Odpowiedz wyłącznie obiektem JSON {"title":"...","lead":"...","body":"..."}, bez komentarza.',
    '',
    JSON.stringify({ title: wpis.title, lead: wpis.lead, body: wpis.body ?? '' }),
  ].join('\n');

  try {
    const odp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': klucz,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: polecenie }],
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!odp.ok) throw new Error(`odpowiedź ${odp.status}`);
    const dane = await odp.json();
    const tekst = dane.content?.map((c) => c.text ?? '').join('') ?? '';
    const wycinek = tekst.slice(tekst.indexOf('{'), tekst.lastIndexOf('}') + 1);
    const przeklad = JSON.parse(wycinek);
    if (!przeklad?.title) throw new Error('brak tytułu w odpowiedzi');
    /* Ostatnia zapora przed znakiem, którego w projekcie nie ma. Model dostał zakaz
     * wprost, ale polegać na samym poleceniu przy tekście z zewnątrz byłoby lekkomyślne. */
    const bezMyslnika = (t) => String(t ?? '').replace(/\u2014/g, ',');
    return {
      ...wpis,
      title: bezMyslnika(przeklad.title),
      lead: bezMyslnika(przeklad.lead || wpis.lead),
      body: przeklad.body ? bezMyslnika(przeklad.body) : wpis.body,
      language: 'pl',
      /* Zapisane wprost, bo czytelnik ma prawo wiedzieć, że tekst przeszedł przez maszynę,
       * a nie przez tłumacza. Karta i artykuł pokazują to na wierzchu. */
      translated: true,
    };
  } catch (blad) {
    console.log(`\n  przekład "${wpis.title.slice(0, 40)}" nie wyszedł (${blad.message})`);
    return wpis;
  }
}

/* --------------------------------------------------------------------- APOD */

/*
 * Zdjęcie dnia z osobnego interfejsu, a nie z kanału RSS.
 *
 * W kanale wpis APOD ma opis złożony wyłącznie z regułki o publikacji, a pełna treść to
 * cała strona razem z menu, więc na karcie lądowało "APOD Archive Submissions Index Search
 * Calendar RSS Education". Interfejs APOD zwraca to samo w postaci uporządkowanej: tytuł,
 * opis i adres obrazu.
 *
 * Jest tam też pole copyright i ono jest tu najważniejsze. Zdjęcia dnia w większości robią
 * astrofotografowie amatorzy, którzy zachowują do nich prawa, a NASA publikuje je za zgodą.
 * Obraz bierzemy więc tylko wtedy, gdy tego pola nie ma, czyli gdy zdjęcie powstało
 * w agencji i jest dobrem publicznym. W pozostałych wypadkach zostaje sam tekst i odnośnik
 * do oryginału, bo do opisu prawa ma NASA, a do fotografii nie.
 *
 * Klucz DEMO_KEY wystarcza, bo pozwala na dziesięć zapytań na godzinę, a robimy jedno
 * na dobę. Własny klucz w NASA_API_KEY zdejmuje ten limit, gdyby pobieranie miało chodzić
 * częściej.
 */
async function zdjecieDnia() {
  process.stdout.write('zdjęcie dnia: ');
  const klucz = process.env.NASA_API_KEY || 'DEMO_KEY';
  try {
    const odp = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${klucz}`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!odp.ok) throw new Error(`odpowiedź ${odp.status}`);
    const d = await odp.json();
    if (!d?.title || !d?.explanation) throw new Error('niekompletna odpowiedź');
    const opis = String(d.explanation).replace(/\s+/g, ' ').trim();

    const dzien = String(d.date).slice(2).replace(/-/g, '');
    const wlasne = !d.copyright && d.media_type === 'image';
    console.log(wlasne ? 'ze zdjęciem' : 'sam tekst, obraz jest cudzy');
    return [
      {
        id: `apod-${d.date}`,
        title: d.title,
        lead: skroc(opis, 240),
        /* Opis zdjęcia dnia to gotowy, skończony tekst napisany przez NASA, więc jest
         * dobrem publicznym i wolno go u nas opublikować w całości. Bez tego jedyny wpis
         * APOD wyrzucałby czytelnika na zewnątrz mimo że treść mamy. */
        body: opis.length > 200 ? opis : undefined,
        date: new Date(`${d.date}T04:05:00Z`).toISOString(),
        category: 'wydarzenie',
        source: `https://apod.nasa.gov/apod/ap${dzien}.html`,
        sourceLabel: 'NASA APOD',
        language: 'en',
        image: wlasne ? d.url : undefined,
        credit: d.copyright ? String(d.copyright).replace(/\s+/g, ' ').trim().slice(0, 120) : 'NASA',
      },
    ];
  } catch (blad) {
    console.log(`nie udało się (${blad.message})`);
    return [];
  }
}

/* ------------------------------------------------------------------ główne */

/*
 * Zajawka wpisu.
 *
 * WordPress dokleja na końcu opisu zdanie w rodzaju "The post X appeared first on Y",
 * a przy wpisach APOD to zdanie jest całym opisem. Zostawione tak, jak przyszło, dawało
 * na karcie tekst mówiący wyłącznie, że wpis się gdzieś ukazał. Usuwamy tę regułkę,
 * a jeżeli po jej usunięciu nie zostaje nic sensownego, sięgamy po pierwsze zdania
 * pełnej treści, którą kanał i tak przysyła.
 */
const REGULKA = /\s*The post\b[\s\S]*?appeared first on\b[\s\S]*$/i;

function zajawka(wpis) {
  const opis = naTekst(wpis.description).replace(REGULKA, '').trim();
  if (opis.length >= 60) return opis;
  const tresc = naTekst(wpis.content).replace(REGULKA, '').trim();
  return tresc.length > opis.length ? tresc : opis;
}

function skroc(tekst, limit) {
  if (tekst.length <= limit) return tekst;
  const ciecie = tekst.slice(0, limit);
  const kropka = Math.max(ciecie.lastIndexOf('. '), ciecie.lastIndexOf('? '));
  return kropka > limit * 0.5 ? ciecie.slice(0, kropka + 1) : `${ciecie.trimEnd()}...`;
}

function identyfikator(zrodlo, link) {
  /* Odnośnik jest w obu serwisach trwały, więc wystarczy za klucz. Skrót utrzymuje
   * stałą długość i nie wpuszcza do pliku znaków, które psułyby atrybut w HTML. */
  let skrot = 0;
  for (let i = 0; i < link.length; i++) skrot = (skrot * 31 + link.charCodeAt(i)) | 0;
  return `${zrodlo}-${(skrot >>> 0).toString(36)}`;
}

async function zrodlo({ nazwa, url, etykieta, jezyk, zdjecia, pelnaTresc }) {
  process.stdout.write(`${nazwa}: `);
  let wpisy;
  try {
    wpisy = rozbierz(await pobierz(url));
  } catch (blad) {
    console.log(`nie udało się pobrać (${blad.message})`);
    return [];
  }
  const dobre = wpisy.filter(przydatny).map((w) => {
    const opis = zajawka(w);
    return {
      id: identyfikator(nazwa, w.link),
      title: skroc(w.title, 160),
      lead: skroc(opis, 240),
      date: new Date(w.date || Date.now()).toISOString(),
      category: kategoria(w.title, w.categories),
      source: w.link,
      sourceLabel: etykieta,
      language: jezyk,
      image: zdjecia ? wybierzZdjecie(w.content || w.description) : undefined,
      body: pelnaTresc ? tresc(w.content || '') : undefined,
    };
  });
  console.log(`${wpisy.length} wpisów, po odsianiu ${dobre.length}`);
  return dobre;
}

/*
 * Zabezpieczenie przed angielszczyzną na polskiej stronie.
 *
 * Aplikacja rozpoznaje wpis własny po tym, że ma treść: wtedy podpisuje go "Czytaj dalej"
 * i otwiera u nas. Kiedy tłumaczenie nie doszło do skutku, bo zabrakło klucza albo model
 * nie odpowiedział, wpis zostawał po angielsku i mimo to trafiał na stronę jako nasz tekst.
 * Czytelnik dostawał wtedy polską zapowiedź i angielski artykuł pod spodem.
 *
 * Dlatego nieprzełożonemu wpisowi zabieramy treść. Nic nie ginie: pozycja nadal jest na
 * liście, tylko z podpisem "Czytaj u wydawcy" i odnośnikiem do NASA, gdzie angielski jest
 * na miejscu. Kiedy klucz wróci, następne pobranie przełoży wpis i treść wraca sama.
 */
function doWydawcyGdyNieprzelozony(wpis) {
  if (wpis.language === 'pl' || !wpis.body) return wpis;
  return { ...wpis, body: '' };
}

async function main() {
  console.log('Pobieranie aktualności astronomicznych\n');

  /* Poprzedni plik czytamy na wstępie, bo trzyma gotowe przekłady. */
  let poprzednie = null;
  try {
    poprzednie = JSON.parse(await readFile(WYJSCIE, 'utf8'));
  } catch {
    /* Pierwsze uruchomienie, pliku jeszcze nie ma. */
  }

  let apod = await zdjecieDnia();

  let nasa = await zrodlo({
    nazwa: 'nasa',
    url: 'https://science.nasa.gov/feed/',
    etykieta: 'NASA Science',
    jezyk: 'en',
    zdjecia: true,
    pelnaTresc: true,
  });
  /* Wpis APOD z kanału odpada, bo ten sam materiał mamy już w lepszej postaci. */
  nasa = nasa.filter((w) => !/^APOD:/i.test(w.title));
  /* Zdjęcie dnia idzie przez to samo tłumaczenie co reszta wpisów NASA. Przy osobnej
   * ścieżce zostawało po angielsku i było jedynym takim wpisem na całej liście. */
  const doPrzekladu = [...apod, ...nasa];
  if (doPrzekladu.length) {
    process.stdout.write('tłumaczenie: ');
    const przelozone = await przetlumacz(doPrzekladu, poprzednie);
    apod = przelozone.slice(0, apod.length);
    nasa = przelozone.slice(apod.length);
    console.log(przelozone.some((w) => w.language === 'pl') ? 'gotowe' : 'pominięte');
  }

  const astronet = await zrodlo({
    nazwa: 'astronet',
    url: 'https://astronet.pl/feed/',
    etykieta: 'AstroNET',
    jezyk: 'pl',
    zdjecia: false,
    pelnaTresc: false,
  });

  const wszystkie = [...apod, ...nasa, ...astronet]
    .map(doWydawcyGdyNieprzelozony)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LIMIT);

  if (!wszystkie.length) {
    console.log('\nNic nie pobrano. Zostawiam poprzedni plik nietknięty.');
    process.exitCode = 1;
    return;
  }

  const plik = {
    updated: new Date().toISOString(),
    /* Zapisane wprost, żeby aplikacja mogła pokazać źródła bez zaglądania do kodu. */
    sources: [
      { label: 'NASA Science', url: 'https://science.nasa.gov/', note: 'teksty w domenie publicznej' },
      { label: 'NASA APOD', url: 'https://apod.nasa.gov/apod/', note: 'opis NASA, zdjęcia często autorskie' },
      { label: 'AstroNET', url: 'https://astronet.pl/', note: 'tytuły i zajawki, treść u wydawcy' },
    ],
    posts: wszystkie,
  };

  await mkdir(dirname(WYJSCIE), { recursive: true });
  await writeFile(WYJSCIE, `${JSON.stringify(plik, null, 2)}\n`, 'utf8');

  const nowe = poprzednie
    ? wszystkie.filter((w) => !poprzednie.posts?.some((p) => p.id === w.id)).length
    : wszystkie.length;
  console.log(`\nZapisano ${wszystkie.length} wpisów do public/data/news.json, w tym nowych: ${nowe}`);
}

main().catch((blad) => {
  console.error('Pobieranie przerwane:', blad.message);
  process.exitCode = 1;
});
