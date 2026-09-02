/*
 * Polska warstwa nazewnicza dla bazy lokalizacji.
 *
 * GeoNames podaje nazwy miejscowości w formie lokalnej, więc dla Polski są one
 * z reguły poprawne razem ze znakami diakrytycznymi. Poniżej trzymamy tylko wyjątki,
 * czyli miejsca, dla których baza używa nazwy angielskiej albo uproszczonej.
 * Klucz ma postać "kod kraju:nazwa bez znaków diakrytycznych".
 */

export const CITY_NAMES_PL = {
  'PL:Warsaw': 'Warszawa',
  'PL:Bielsko-Biala': 'Bielsko-Biała',
  'PL:Czestochowa': 'Częstochowa',
  'PL:Gdansk': 'Gdańsk',
  'PL:Krakow': 'Kraków',
  'PL:Lodz': 'Łódź',
  'PL:Poznan': 'Poznań',
  'PL:Rzeszow': 'Rzeszów',
  'PL:Torun': 'Toruń',
  'PL:Wroclaw': 'Wrocław',
  'PL:Bialystok': 'Białystok',
};

/*
 * Dzielnice dużych miast pojawiają się w bazie jako osobne miejscowości i przy
 * sortowaniu po liczbie mieszkańców wypychałyby prawdziwe miasta z listy wyników.
 * Kluczem jest nazwa w postaci bez znaków diakrytycznych.
 */
export const EXCLUDED_DISTRICTS = new Set([
  'bemowo', 'bialoleka', 'bielany', 'mokotow', 'ochota', 'praga polnoc',
  'praga poludnie', 'rembertow', 'srodmiescie', 'targowek', 'ursus', 'ursynow',
  'wawer', 'wesola', 'wilanow', 'wlochy', 'wola', 'zoliborz',
  'fordon', 'psie pole', 'wrzeszcz', 'nowa huta', 'krzyki', 'stare miasto',
  'grunwald', 'jezyce', 'nowe miasto', 'podgorze',
]);

/* Polskie nazwy krajów, używane w podpowiedziach wyszukiwarki lokalizacji.
 * Lista obejmuje państwa, których miasta faktycznie trafiają do bazy. */
export const COUNTRY_NAMES_PL = {
  AE: 'Zjednoczone Emiraty Arabskie', AF: 'Afganistan', AL: 'Albania', AM: 'Armenia',
  AO: 'Angola', AR: 'Argentyna', AT: 'Austria', AU: 'Australia', AZ: 'Azerbejdżan',
  BA: 'Bośnia i Hercegowina', BD: 'Bangladesz', BE: 'Belgia', BF: 'Burkina Faso',
  BG: 'Bułgaria', BI: 'Burundi', BJ: 'Benin', BO: 'Boliwia', BR: 'Brazylia',
  BY: 'Białoruś', CA: 'Kanada', CD: 'Demokratyczna Republika Konga',
  CG: 'Kongo', CH: 'Szwajcaria', CI: 'Wybrzeże Kości Słoniowej', CL: 'Chile',
  CM: 'Kamerun', CN: 'Chiny', CO: 'Kolumbia', CR: 'Kostaryka', CU: 'Kuba',
  CY: 'Cypr', CZ: 'Czechy', DE: 'Niemcy', DK: 'Dania', DO: 'Dominikana',
  DZ: 'Algieria', EC: 'Ekwador', EE: 'Estonia', EG: 'Egipt', ES: 'Hiszpania',
  ET: 'Etiopia', FI: 'Finlandia', FR: 'Francja', GB: 'Wielka Brytania',
  GE: 'Gruzja', GH: 'Ghana', GN: 'Gwinea', GR: 'Grecja', GT: 'Gwatemala',
  HN: 'Honduras', HR: 'Chorwacja', HT: 'Haiti', HU: 'Węgry', ID: 'Indonezja',
  IE: 'Irlandia', IL: 'Izrael', IN: 'Indie', IQ: 'Irak', IR: 'Iran',
  IS: 'Islandia', IT: 'Włochy', JM: 'Jamajka', JO: 'Jordania', JP: 'Japonia',
  KE: 'Kenia', KG: 'Kirgistan', KH: 'Kambodża', KP: 'Korea Północna',
  KR: 'Korea Południowa', KW: 'Kuwejt', KZ: 'Kazachstan', LB: 'Liban',
  LK: 'Sri Lanka', LT: 'Litwa', LU: 'Luksemburg', LV: 'Łotwa', LY: 'Libia',
  MA: 'Maroko', MD: 'Mołdawia', MG: 'Madagaskar', MK: 'Macedonia Północna',
  ML: 'Mali', MM: 'Mjanma', MN: 'Mongolia', MT: 'Malta', MX: 'Meksyk',
  MY: 'Malezja', MZ: 'Mozambik', NG: 'Nigeria', NI: 'Nikaragua',
  NL: 'Holandia', NO: 'Norwegia', NP: 'Nepal', NZ: 'Nowa Zelandia',
  OM: 'Oman', PA: 'Panama', PE: 'Peru', PH: 'Filipiny', PK: 'Pakistan',
  PL: 'Polska', PT: 'Portugalia', PY: 'Paragwaj', QA: 'Katar', RO: 'Rumunia',
  RS: 'Serbia', RU: 'Rosja', RW: 'Rwanda', SA: 'Arabia Saudyjska',
  SD: 'Sudan', SE: 'Szwecja', SG: 'Singapur', SI: 'Słowenia', SK: 'Słowacja',
  SN: 'Senegal', SO: 'Somalia', SV: 'Salwador', SY: 'Syria', TD: 'Czad',
  TG: 'Togo', TH: 'Tajlandia', TJ: 'Tadżykistan', TM: 'Turkmenistan',
  TN: 'Tunezja', TR: 'Turcja', TW: 'Tajwan', TZ: 'Tanzania', UA: 'Ukraina',
  UG: 'Uganda', US: 'Stany Zjednoczone', UY: 'Urugwaj', UZ: 'Uzbekistan',
  VE: 'Wenezuela', VN: 'Wietnam', YE: 'Jemen', ZA: 'Republika Południowej Afryki',
  ZM: 'Zambia', ZW: 'Zimbabwe',
};
