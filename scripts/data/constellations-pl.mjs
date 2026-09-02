/*
 * Polska warstwa nazewnicza gwiazdozbiorów.
 *
 * Podstawowym źródłem nazw i dopełniaczy są tłumaczenia Stellarium
 * (po/stellarium-skycultures/pl.po oraz po/stellarium-sky/pl.po). Poniżej trzymamy
 * wyłącznie to, czego w Stellarium nie ma albo co odbiega od utrwalonej polskiej
 * konwencji astronomicznej. Każde nadpisanie ma podane uzasadnienie, żeby nie było
 * to ciche odstępstwo od źródła.
 */

export const NAME_OVERRIDES = {
  /* Stellarium: "Wąż Wodny (Hydra)". W polskim piśmiennictwie gwiazdozbiór ten
   * nosi nazwę Hydra, a Wąż Wodny to Hydrus, czyli osobny obiekt. */
  Hya: 'Hydra',
  /* Stellarium: "Mały Wąż Wodny". Utrwalona nazwa polska dla Hydrus to Wąż Wodny. */
  Hyi: 'Wąż Wodny',
  /* Stellarium: "Kasjopea". Powszechniejsza forma polska to Kasjopeja. */
  Cas: 'Kasjopeja',
  /* Stellarium: "Rajski Ptak". Utrwalony szyk to Ptak Rajski. */
  Aps: 'Ptak Rajski',
  /* Stellarium: "Latająca Ryba". Utrwalony szyk to Ryba Latająca. */
  Vol: 'Ryba Latająca',
  /* Stellarium: "Sieć". Reticulum tłumaczy się jako Siatka. */
  Ret: 'Siatka',
  /* Stellarium: "Sekstans". Polska nazwa to Sekstant. */
  Sex: 'Sekstant',
  /* Stellarium: "Luneta". Telescopium tłumaczy się jako Teleskop. */
  Tel: 'Teleskop',
};

/* Dopełniacze, których zabrakło w tłumaczeniu Stellarium albo które wymagają korekty
 * po zmianie nazwy mianownikowej powyżej. */
export const GENITIVE_OVERRIDES = {
  /* Błąd w tłumaczeniu Stellarium: dopełniacz "Centauri" jest tam podany
   * jako "Byka", czyli dopełniacz Byka. Poprawna forma to Centaura. */
  Cen: 'Centaura',
  Hya: 'Hydry',
  Hyi: 'Węża Wodnego',
  Cas: 'Kasjopei',
  Aps: 'Ptaka Rajskiego',
  Vol: 'Ryby Latającej',
  Ret: 'Siatki',
  Sex: 'Sekstantu',
  Tel: 'Teleskopu',
};

/*
 * Sezon najlepszej widoczności z terenu Polski, czyli pora roku, w której
 * gwiazdozbiór góruje w środku nocy. Wartość "niewidoczny" oznacza, że przy
 * szerokości około 52 stopni na północ figura nie wznosi się nad horyzont
 * albo pokazuje się tylko szczątkowo.
 */
export const SEASONS = {
  And: 'jesień', Ant: 'wiosna', Aps: 'niewidoczny', Aql: 'lato', Aqr: 'jesień',
  Ara: 'niewidoczny', Ari: 'jesień', Aur: 'zima', Boo: 'wiosna', Cae: 'zima',
  Cam: 'całoroczny', Cap: 'jesień', Car: 'niewidoczny', Cas: 'całoroczny',
  Cen: 'niewidoczny', Cep: 'całoroczny', Cet: 'jesień', Cha: 'niewidoczny',
  Cir: 'niewidoczny', CMa: 'zima', CMi: 'zima', Cnc: 'zima', Col: 'zima',
  Com: 'wiosna', CrA: 'lato', CrB: 'lato', Crt: 'wiosna', Cru: 'niewidoczny',
  Crv: 'wiosna', CVn: 'wiosna', Cyg: 'lato', Del: 'lato', Dor: 'niewidoczny',
  Dra: 'całoroczny', Equ: 'jesień', Eri: 'zima', For: 'jesień', Gem: 'zima',
  Gru: 'niewidoczny', Her: 'lato', Hor: 'niewidoczny', Hya: 'wiosna',
  Hyi: 'niewidoczny', Ind: 'niewidoczny', Lac: 'jesień', Leo: 'wiosna',
  Lep: 'zima', Lib: 'lato', LMi: 'wiosna', Lup: 'niewidoczny', Lyn: 'zima',
  Lyr: 'lato', Men: 'niewidoczny', Mic: 'jesień', Mon: 'zima', Mus: 'niewidoczny',
  Nor: 'niewidoczny', Oct: 'niewidoczny', Oph: 'lato', Ori: 'zima',
  Pav: 'niewidoczny', Peg: 'jesień', Per: 'jesień', Phe: 'niewidoczny',
  Pic: 'niewidoczny', PsA: 'jesień', Psc: 'jesień', Pup: 'zima', Pyx: 'wiosna',
  Ret: 'niewidoczny', Scl: 'jesień', Sco: 'lato', Sct: 'lato', Ser: 'lato',
  Sex: 'wiosna', Sge: 'lato', Sgr: 'lato', Tau: 'zima', Tel: 'niewidoczny',
  TrA: 'niewidoczny', Tri: 'jesień', Tuc: 'niewidoczny', UMa: 'całoroczny',
  UMi: 'całoroczny', Vel: 'niewidoczny', Vir: 'wiosna', Vol: 'niewidoczny',
  Vul: 'lato',
};

/*
 * Asteryzmy, czyli układy gwiazd rozpoznawalne gołym okiem, które nie są
 * osobnymi gwiazdozbiorami. Klucze odpowiadają identyfikatorom Stellarium.
 * Tłumaczymy tylko te, które faktycznie funkcjonują w polskiej praktyce
 * obserwacyjnej. Pozostałe zostają pominięte, żeby nie zaśmiecać mapy.
 */
export const ASTERISMS_PL = {
  STr: { pl: 'Trójkąt Letni', note: 'Wega, Deneb i Altair. Wyznacza letnie niebo, a przecina go pas Drogi Mlecznej.' },
  WTr: { pl: 'Trójkąt Zimowy', note: 'Betelgeza, Syriusz i Procjon. Trzy jasne gwiazdy dominujące zimową noc.' },
  SpT: { pl: 'Trójkąt Wiosenny', note: 'Arktur, Spica i Regulus. Otwiera sezon obserwacji galaktyk.' },
  GSP: { pl: 'Wielki Kwadrat Pegaza', note: 'Cztery gwiazdy tworzące najłatwiejszy punkt orientacyjny jesiennego nieba.' },
  WHx: { pl: 'Sześciokąt Zimowy', note: 'Kapella, Aldebaran, Rigel, Syriusz, Procjon i Polluks. Największa jasna figura nieba.' },
  NCr: { pl: 'Krzyż Północy', note: 'Główna figura Łabędzia, latem stojąca niemal pionowo nad zachodnim horyzontem.' },
  BDr: { pl: 'Wielki Wóz', note: 'Siedem gwiazd Wielkiej Niedźwiedzicy. Przedłużenie tylnej ściany wskazuje Gwiazdę Polarną.' },
  LDr: { pl: 'Mały Wóz', note: 'Figura Małej Niedźwiedzicy zakończona Gwiazdą Polarną.' },
  Ptr: { pl: 'Wskaźniki', note: 'Dubhe i Merak. Odcinek między nimi przedłużony pięciokrotnie trafia w Gwiazdę Polarną.' },
  WAs: { pl: 'W Kasjopei', note: 'Charakterystyczna litera W, widoczna z Polski przez cały rok.' },
  GDi: { pl: 'Wielki Diament', note: 'Arktur, Spica, Denebola i Serce Karola. Rozległa figura wiosennego nieba.' },
  Tea: { pl: 'Dzbanek', note: 'Jasna część Strzelca. Jego dziobek wskazuje kierunek na centrum Galaktyki.' },
  Kit: { pl: 'Latawiec', note: 'Główna figura Wolarza, rozpięta od Arktura ku północy.' },
  KSt: { pl: 'Zwornik Herkulesa', note: 'Czworobok w środku Herkulesa. Na jego zachodniej krawędzi leży gromada M13.' },
  HeG: { pl: 'Niebieskie G', note: 'Rozległa pętla przez sześć zimowych gwiazdozbiorów, obejmująca Sześciokąt Zimowy.' },
  SoP: { pl: 'Segment Perseusza', note: 'Łuk gwiazd Perseusza biegnący od Mirfaka ku Algolowi.' },
  OrB: { pl: 'Pas Oriona', note: 'Alnitak, Alnilam i Mintaka. Trzy gwiazdy w jednej linii, poniżej których wisi Mgławica Oriona.' },
  OrS: { pl: 'Miecz Oriona', note: 'Pionowy łańcuszek pod Pasem. Środkowy punkt to Wielka Mgławica w Orionie.' },
  CoH: { pl: 'Wieszak', note: 'Gromada Brocchiego w Lisku. Przez lornetkę wygląda jak wieszak na ubrania.' },
  HDr: { pl: 'Głowa Smoka', note: 'Czworobok zamykający figurę Smoka, tuż obok Wegi.' },
  Goa: { pl: 'Koźlęta', note: 'Trójkącik gwiazd przy Kapelli w Woźnicy.' },
  Urn: { pl: 'Dzban Wodnika', note: 'Litera Y w środku Wodnika, umownie oznaczająca wylewaną wodę.' },
  VTa: { pl: 'V Byka', note: 'Hiady, najbliższa nam gromada otwarta, tworzące pysk Byka. Aldebaran leży na jej tle.' },
  Sal: { pl: 'Żagiel', note: 'Trapez gwiazd w Perseuszu i Andromedzie.' },
  Bfl: { pl: 'Motyl', note: 'Gromada M6 w Skorpionie, kształtem przypominająca rozłożone skrzydła.' },
  Mlk: { pl: 'Mleczna Chochla', note: 'Część Dzbanka Strzelca, zanurzona w najjaśniejszym fragmencie Drogi Mlecznej.' },
};
