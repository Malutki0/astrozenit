import { useCallback, useEffect, useRef, useState } from 'react';

import type { CatalogBundle } from '@/lib/catalog/types';
import { SkyRenderer } from '@/lib/render/SkyRenderer';
import { clampAltitude, clampFov, wrapAzimuth } from '@/lib/render/projection';
import type { SkyObjectRef } from '@/lib/render/types';
import { useSatelliteStore } from '@/state/useSatellites';
import { emitPreciseTime, useSkyStore } from '@/state/useSkyStore';
import { usePrefersReducedMotion } from '@/state/usePrefersReducedMotion';

import styles from './SkyCanvas.module.css';
import { przechwycWskaznik } from '../../lib/wskaznik';

interface Props {
  catalog: CatalogBundle;
  onRendererReady?: (renderer: SkyRenderer | null) => void;
}

/*
 * Wspólna pusta tablica satelitów.
 *
 * Zapis "?? []" tworzy nową tablicę przy każdym wywołaniu, a porównanie tożsamości
 * dwóch osobnych pustych tablic zawsze wypada negatywnie. Pomijanie klatek opiera się
 * właśnie na tożsamości, więc jedna literka nawiasu wystarczała, żeby optymalizacja
 * nigdy nie zadziałała, i to bez żadnego widocznego objawu.
 */
const BRAK_SATELITOW: never[] = [];

const KEY_PAN_DEG = 4;
const KEY_ZOOM_FACTOR = 1.18;

export function SkyCanvas({ catalog, onRendererReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SkyRenderer | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [pointing, setPointing] = useState(false);

  /* Wskaźniki aktywnych dotknięć, potrzebne do rozpoznania gestu szczypania. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null);
  const pinchRef = useRef<{ distance: number; fov: number } | null>(null);
  /*
   * Wybieg kamery.
   *
   * Trzymamy prędkość w stopniach na milisekundę, osobno dla azymutu i wysokości.
   * W trakcie przeciągania jest liczona z każdego ruchu wskaźnika, a po puszczeniu
   * wygasa wykładniczo w pętli klatek. Wartości leżą w ref, a nie w stanie Reacta,
   * bo zmieniają się co klatkę i przerysowywanie drzewa komponentów sześćdziesiąt razy
   * na sekundę byłoby czystą stratą.
   */
  const wybiegRef = useRef({ az: 0, alt: 0, czas: 0 });

  /*
   * Znacznik ruchu kamery, wystawiany na elemencie html.
   *
   * Arkusz szkła podmienia pod nim kosztowny filtr SVG na zwykłe rozmycie, bo w czasie
   * ruchu i tak nie widać różnicy, a widać każdą zgubioną klatkę. Trzymamy chwilę,
   * do której ruch uznajemy za trwający, a nie zwykłą flagę: dzięki temu wybieg
   * i pojedyncze stuknięcia strzałką nie migają szkłem w tę i z powrotem.
   */
  const ruchDoRef = useRef(0);

  /*
   * Zapalenie znacznika następuje od razu przy geście, a nie w pętli klatek.
   *
   * Pierwsza wersja ustawiała go dopiero w pętli i przez to tania wersja szkła wchodziła
   * o klatkę za późno, czyli dokładnie wtedy, gdy najbardziej zależy na jej obecności:
   * przy pierwszym ruchu palca. Gaszenie zostaje w pętli, bo tam wiadomo, że ruch ustał.
   */
  const gasnieRef = useRef(0);
  /* Pętla klatek powstaje raz i nie ma w zależnościach funkcji z ciała komponentu.
   * Referencja daje jej dostęp do aktualnej wersji bez przebudowywania całego efektu. */
  const zaznaczRuchRef = useRef<(naDlugo?: number) => void>(() => {});

  const zaznaczRuch = (naDlugo = 160) => {
    ruchDoRef.current = performance.now() + naDlugo;
    if (document.documentElement.dataset.kamera !== 'rusza') {
      document.documentElement.dataset.kamera = 'rusza';
    }
    /*
     * Gaszenie na liczniku, a nie w pętli klatek.
     *
     * Pętla stoi, gdy karta jest w tle, bo przeglądarka wstrzymuje wtedy klatki zupełnie.
     * Sprawdzone: w ukrytym dokumencie requestAnimationFrame nie odpala się ani razu przez
     * dwie sekundy. Gaszenie oparte na pętli zostawiałoby więc tańsze szkło na stałe
     * u każdego, kto przełączył kartę w trakcie przesuwania mapy. Licznik chodzi
     * niezależnie od klatek, więc znacznik gaśnie zawsze.
     */
    window.clearTimeout(gasnieRef.current);
    gasnieRef.current = window.setTimeout(() => {
      if (dragRef.current) return;
      delete document.documentElement.dataset.kamera;
    }, naDlugo);
  };
  zaznaczRuchRef.current = zaznaczRuch;

  /* Renderer tworzymy raz. Kolejne zmiany stanu wpychamy do niego w pętli klatek,
   * dzięki czemu przesuwanie mapy nie powoduje przerysowania drzewa Reacta. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = useSkyStore.getState();
    const renderer = new SkyRenderer(canvas, catalog, {
      date: s.date,
      location: s.location,
      view: s.view,
      layers: s.layers,
      magLimit: s.magLimit,
      selected: s.selected,
      reducedMotion,
      timeScale: s.timeScale,
      satellites: useSatelliteStore.getState().set?.satellites ?? [],
    });
    rendererRef.current = renderer;
    renderer.resize();
    onRendererReady?.(renderer);

    /* Uchwyt diagnostyczny wyłącznie w trybie deweloperskim, do pomiarów wydajności. */
    if (import.meta.env.DEV) {
      (window as unknown as { __zenit?: unknown }).__zenit = {
        renderer,
        store: useSkyStore,
        benchmark(frames = 120) {
          const times: number[] = [];
          for (let i = 0; i < frames; i++) {
            const t = performance.now();
            renderer.render();
            times.push(performance.now() - t);
          }
          times.sort((a, b) => a - b);
          return {
            median: +times[Math.floor(frames / 2)].toFixed(2),
            p95: +times[Math.floor(frames * 0.95)].toFixed(2),
            max: +times[frames - 1].toFixed(2),
          };
        },
      };
    }

    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);

    /*
     * Upływ czasu w pętli klatek.
     *
     * Wcześniej czas przesuwał licznik odpalany co ćwierć sekundy, a w trybie bieżącym
     * data zmieniała się dopiero przy przejściu pełnej sekundy. Niebo skakało więc
     * cztery razy na sekundę przy przewijaniu i raz na sekundę przy podglądzie na żywo.
     * Tutaj czas płynie w każdej klatce, więc ruch jest ciągły.
     *
     * Do sklepu stanu zapisujemy go rzadko, bo zapis przerysowuje drzewo Reacta,
     * a zegar w pasku i tak nie potrzebuje sześćdziesięciu odświeżeń na sekundę.
     * Renderer dostaje wartość dokładną, interfejs zaokrągloną w czasie.
     */
    let frame = 0;
    let lastFrame = performance.now();
    let lastPush = 0;
    let simTime = useSkyStore.getState().date.getTime();
    /* Ostatnia wartość, którą sami wpisaliśmy do sklepu. Pozwala rozpoznać zmianę
     * przyszłą z zewnątrz, na przykład z osi czasu albo z kliknięcia w kalendarzu. */
    let ownWrite = simTime;

    /* Stan ostatniej narysowanej klatki, do porównania w następnej. */
    const ostatniRysunek: {
      sygnatura: string;
      layers: unknown;
      location: unknown;
      selected: unknown;
      satelity: unknown;
      czas: number;
    } = { sygnatura: '', layers: null, location: null, selected: null, satelity: null, czas: 0 };

    const loop = () => {
      const now = performance.now();
      /* Ograniczenie kroku: po powrocie z karty w tle różnica potrafi wynieść sekundy,
       * a wtedy niebo przeskoczyłoby o wielką wartość zamiast płynnie nadążyć. */
      const delta = Math.min(80, now - lastFrame);
      lastFrame = now;

      /*
       * Wygaszanie wybiegu kamery.
       *
       * Prędkość maleje wykładniczo, o stały ułamek na milisekundę, więc tempo hamowania
       * nie zależy od tego, ile klatek zdążyło się narysować. Przy stałym ułamku na klatkę
       * kamera hamowałaby wolniej na słabszym sprzęcie, czyli dokładnie tam, gdzie i tak
       * jest gorzej.
       *
       * Współczynnik 0.9965 na milisekundę oznacza spadek do jednej trzeciej po około
       * trzystu milisekundach i praktyczne zatrzymanie po sekundzie. Próg 0.00004 stopnia
       * na milisekundę ucina ogon, w którym ruch jest już poniżej jednego piksela na sekundę
       * i tylko trzymałby pętlę w stanie zajętym.
       */
      if (!dragRef.current && !reducedMotion) {
        const w = wybiegRef.current;
        if (Math.abs(w.az) > 0.00004 || Math.abs(w.alt) > 0.00004) {
          const zanik = Math.pow(0.9965, delta);
          useSkyStore.getState().panBy(w.az * delta, w.alt * delta);
          /* Wybieg też jest ruchem kamery, więc odnawia znacznik i jego licznik. */
          zaznaczRuchRef.current(160);
          w.az *= zanik;
          w.alt *= zanik;
        } else if (w.az !== 0 || w.alt !== 0) {
          w.az = 0;
          w.alt = 0;
        }
      }

      const state = useSkyStore.getState();
      if (state.date.getTime() !== ownWrite) {
        /* Datę zmienił ktoś inny niż ta pętla, więc przyjmujemy jego wartość. */
        simTime = state.date.getTime();
        ownWrite = simTime;
      }

      if (state.live) {
        simTime = Date.now();
      } else if (state.timeScale !== 1 && state.timeScale !== 0) {
        simTime += delta * state.timeScale;
      }

      const date = new Date(simTime);

      /*
       * Pomijanie klatek, w których nie ma czego przerysować.
       *
       * Zmierzone: sama klatka kosztuje medianie 0.9 ms, czyli mieści się w budżecie
       * z dziesięciokrotnym zapasem. Problemem nie jest więc koszt klatki, tylko ich
       * liczba. Przy nieruchomym niebie pętla rysowała sześćdziesiąt identycznych obrazów
       * na sekundę i grzała procesor bez skutku na ekranie, a jest to aplikacja,
       * z której korzysta się w terenie, na baterii.
       *
       * Sygnatura obejmuje wszystko, co trafia do setInput. Tożsamości obiektów wystarczą,
       * bo sklep tworzy nowe przy każdej zmianie, a liczby porównujemy wprost.
       *
       * Czas jest osobnym przypadkiem, bo zmienia się zawsze. Niebo obraca się o 0.0042
       * stopnia na sekundę, więc przy typowym polu widzenia przesunięcie o jeden piksel
       * trwa kilkanaście sekund. Przerysowanie ma sens dopiero po przekroczeniu ułamka
       * piksela. Progu nie stosujemy, gdy czas jest przewijany albo gdy na niebie są
       * satelity, bo jedno i drugie porusza się o rzędy wielkości szybciej niż gwiazdy.
       */
      const satelity = useSatelliteStore.getState().set?.satellites ?? BRAK_SATELITOW;
      const stopniNaPiksel = state.view.fov / (canvas.clientHeight || 800);
      /*
       * Warunek patrzy na włączoną warstwę, a nie na zawartość magazynu satelitów.
       *
       * Magazyn bywa wypełniony także wtedy, gdy warstwa jest wyłączona, bo dane pobierają
       * się raz i zostają. Sprawdzanie samej długości tablicy sprawiało, że pominięcie
       * klatek nigdy nie wchodziło w życie: satelitów nie było widać, a mimo to niebo
       * przerysowywało się sześćdziesiąt razy na sekundę na wszelki wypadek.
       */
      const satelityWidoczne = state.layers.satellites && satelity.length > 0;
      const szybko = state.timeScale !== 1 || satelityWidoczne || !state.live;
      const obrotStopni = 0.0041780746 * ((simTime - ostatniRysunek.czas) / 1000);
      const czasIstotny = szybko || Math.abs(obrotStopni) > stopniNaPiksel * 0.3;

      const sygnatura =
        `${state.view.azimuth},${state.view.altitude},${state.view.fov},${state.magLimit}`;
      const bezZmian =
        !czasIstotny &&
        sygnatura === ostatniRysunek.sygnatura &&
        state.layers === ostatniRysunek.layers &&
        state.location === ostatniRysunek.location &&
        state.selected === ostatniRysunek.selected &&
        satelity === ostatniRysunek.satelity;

      if (!bezZmian) {
        ostatniRysunek.sygnatura = sygnatura;
        ostatniRysunek.layers = state.layers;
        ostatniRysunek.location = state.location;
        ostatniRysunek.selected = state.selected;
        ostatniRysunek.satelity = satelity;
        if (czasIstotny) ostatniRysunek.czas = simTime;

        renderer.setInput({
          date,
          location: state.location,
          view: state.view,
          layers: state.layers,
          magLimit: state.magLimit,
          selected: state.selected,
          reducedMotion,
          timeScale: state.live ? 1 : state.timeScale,
          satellites: satelity,
        });
        renderer.render();
      }

      /* Dokładna chwila trafia do odbiorców poza Reactem, więc oś czasu może sunąć
       * płynnie bez przerysowywania drzewa komponentów. */
      emitPreciseTime(simTime);

      /*
       * Zapis do sklepu raz na sekundę. Częściej nie ma czego pokazywać, bo zegar
       * wyświetla pełne minuty, a każdy zapis przerysowuje wszystkie komponenty
       * czytające datę. To była najdroższa rzecz w tej pętli.
       */
      if (now - lastPush > 1000 && Math.floor(simTime / 1000) !== Math.floor(ownWrite / 1000)) {
        lastPush = now;
        ownWrite = simTime;
        useSkyStore.setState({ date });
      }

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    /*
     * Uchwyt diagnostyczny. Pętla klatek stoi, gdy karta jest w tle albo panel podglądu
     * schowany, przez co narzędzia mierzyłyby stan sprzed zmiany i wyciągały fałszywe
     * wnioski. Ten uchwyt pozwala wykonać dokładnie jeden przebieg pętli na żądanie.
     */
    if (import.meta.env.DEV) {
      const handle = window as unknown as { __zenit?: Record<string, unknown> };
      handle.__zenit = {
        ...(handle.__zenit ?? {}),
        step: loop,
        /* Podgląd kierunku patrzenia i wybiegu, żeby dało się zmierzyć hamowanie kamery
         * bez zgadywania z pikseli. */
        widok: () => ({ ...useSkyStore.getState().view, wybieg: { ...wybiegRef.current } }),
      };
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearTimeout(gasnieRef.current);
      /* Mapa znika, więc znacznik ruchu nie ma prawa zostać na dokumencie i trzymać
       * tańszego szkła w sekcjach otwartych po jej zamknięciu. */
      delete document.documentElement.dataset.kamera;
    };
  }, [catalog, reducedMotion, onRendererReady]);

  /* Prośby o wyśrodkowanie przychodzą z list i wyszukiwarki. */
  const focusRequest = useSkyStore((s) => s.focusRequest);
  const clearFocus = useSkyStore((s) => s.clearFocus);
  useEffect(() => {
    if (!focusRequest) return;
    useSkyStore.getState().setView({
      azimuth: focusRequest.azimuth,
      altitude: focusRequest.altitude,
      ...(focusRequest.fov ? { fov: focusRequest.fov } : {}),
    });
    clearFocus();
  }, [focusRequest, clearFocus]);

  const relative = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /*
   * Przybliżanie zakotwiczone w kursorze: zapamiętujemy kierunek nieba pod wskaźnikiem,
   * zmieniamy pole widzenia, a potem obracamy kadr tak, żeby ten sam punkt wrócił
   * pod wskaźnik. Kilka przebiegów wystarcza, bo poprawka szybko maleje.
   */
  const zoomAt = useCallback(
    (factor: number, x: number, y: number) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const store = useSkyStore.getState();
      const before = renderer.screenToAltAz(x, y);
      const nextFov = clampFov(store.view.fov * factor);
      if (nextFov === store.view.fov) return;
      store.setView({ fov: nextFov });

      for (let i = 0; i < 4; i++) {
        const current = useSkyStore.getState().view;
        renderer.setInput({
          date: store.date,
          location: store.location,
          view: current,
          layers: store.layers,
          magLimit: store.magLimit,
          selected: store.selected,
          reducedMotion,
          timeScale: store.timeScale,
          satellites: useSatelliteStore.getState().set?.satellites ?? [],
        });
        renderer.render();
        const after = renderer.screenToAltAz(x, y);
        let dAz = before.azimuth - after.azimuth;
        if (dAz > 180) dAz -= 360;
        if (dAz < -180) dAz += 360;
        const dAlt = before.altitude - after.altitude;
        if (Math.abs(dAz) < 0.01 && Math.abs(dAlt) < 0.01) break;
        useSkyStore.getState().setView({
          azimuth: wrapAzimuth(current.azimuth + dAz),
          altitude: clampAltitude(current.altitude + dAlt, current.fov),
        });
      }
    },
    [reducedMotion],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = relative(event);
    pointers.current.set(event.pointerId, { x, y });
    przechwycWskaznik(event.currentTarget, event.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        fov: useSkyStore.getState().view.fov,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = { x, y, moved: 0 };
    /* Nowy chwyt przerywa wybieg. Kamera ma natychmiast trafić pod palec, a nie
     * dojeżdżać jeszcze przez chwilę w poprzednim kierunku. */
    wybiegRef.current = { az: 0, alt: 0, czas: performance.now() };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = relative(event);
    const renderer = rendererRef.current;

    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x, y });
    }

    /* Gest szczypania steruje wyłącznie polem widzenia. */
    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 8) {
        useSkyStore.getState().setView({
          fov: clampFov((pinchRef.current.fov * pinchRef.current.distance) / distance),
        });
        zaznaczRuch();
      }
      return;
    }

    const drag = dragRef.current;
    if (drag && renderer) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = x;
      drag.y = y;

      const store = useSkyStore.getState();
      const degPerPixel = store.view.fov / (canvasRef.current?.clientHeight || 800);
      /* Blisko zenitu jeden stopień azymutu odpowiada coraz mniejszemu łukowi,
       * więc dzielimy przez cosinus wysokości, żeby ruch myszy zachował tempo. */
      const cos = Math.max(0.22, Math.cos((store.view.altitude * Math.PI) / 180));
      const dAz = (-dx * degPerPixel) / cos;
      const dAlt = dy * degPerPixel;
      store.panBy(dAz, dAlt);
      zaznaczRuch();

      /*
       * Prędkość liczona z ostatniego ruchu, wygładzona średnią ważoną.
       *
       * Bez wygładzenia jeden przypadkowo duży skok wskaźnika tuż przed puszczeniem
       * decydowałby o całym wybiegu i kamera odlatywałaby w bok mimo spokojnego ruchu.
       * Waga 0.7 dla nowego pomiaru zostawia wybieg czuły na zmianę kierunku, a przy tym
       * odporny na pojedynczy wyskok.
       */
      const teraz = performance.now();
      /*
       * Dolny próg odstępu między próbkami wynosi 8 ms, a nie 1 ms.
       *
       * Przeglądarka potrafi dostarczyć kilka zdarzeń ruchu w tej samej milisekundzie,
       * zwłaszcza gdy scala zaległe zdarzenia po zajętej klatce. Dzielenie przesunięcia
       * przez taki odstęp dawało prędkość kilkanaście razy za dużą i kamera po puszczeniu
       * odlatywała przez pół nieba. Osiem milisekund odpowiada odświeżaniu 120 Hz, czyli
       * najkrótszemu odstępowi, jaki niesie realną informację o tempie ruchu.
       */
      const dt = Math.max(8, teraz - (wybiegRef.current.czas || teraz));
      if (dt < 120) {
        /*
         * Ograniczenie prędkości, wyrażone w polu widzenia, a nie w stopniach.
         *
         * Wybieg wygasa ze stałą czasową około 285 ms, więc droga przebyta po puszczeniu
         * to w przybliżeniu prędkość początkowa razy ta stała. Chcemy, żeby najmocniejsze
         * machnięcie przesuwało widok mniej więcej o jeden ekran, czyli o tyle stopni,
         * ile wynosi pole widzenia. Stąd próg równy polu widzenia podzielonemu przez 285.
         *
         * Wiązanie z polem widzenia jest istotne: przy dużym przybliżeniu ten sam ruch
         * palca ma przesuwać niebo o mniej stopni, bo inaczej po puszczeniu traciłoby się
         * z oczu obiekt, w który się właśnie celowało.
         */
        const maks = store.view.fov / 285;
        const nowaAz = wybiegRef.current.az * 0.3 + (dAz / dt) * 0.7;
        const nowaAlt = wybiegRef.current.alt * 0.3 + (dAlt / dt) * 0.7;
        wybiegRef.current.az = Math.max(-maks, Math.min(maks, nowaAz));
        wybiegRef.current.alt = Math.max(-maks, Math.min(maks, nowaAlt));
      }
      wybiegRef.current.czas = teraz;
      return;
    }

    if (renderer) {
      setPointing(renderer.hitTest(x, y) !== null);
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const { x, y } = relative(event);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;

    /* Kliknięcie odróżniamy od przeciągnięcia po sumarycznym przebytym dystansie. */
    if (drag && drag.moved < 6) {
      const renderer = rendererRef.current;
      const hit = renderer?.hitTest(x, y) ?? null;
      useSkyStore.getState().select(hit);
      /* Wskazanie obiektu to nie jest przeciągnięcie, więc nie ma czego wygaszać. */
      wybiegRef.current = { az: 0, alt: 0, czas: 0 };
    } else if (drag && performance.now() - wybiegRef.current.czas > 90) {
      /*
       * Palec stał nieruchomo przez ostatnią dziesiątą sekundy przed puszczeniem.
       * To znaczy, że użytkownik celował, a nie machał, więc kamera ma stanąć tam,
       * gdzie ją zostawił. Bez tego warunku każde puszczenie po chwili bezruchu
       * odsuwałoby widok od obiektu, w który ktoś właśnie wycelował.
       */
      wybiegRef.current = { az: 0, alt: 0, czas: 0 };
    }
    dragRef.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const { x, y } = relative(event);
    const factor = Math.exp(event.deltaY * 0.0016);
    /* Kółko myszy daje serię zdarzeń, więc znacznik trzymamy nieco dłużej: inaczej
     * gasłby i zapalał się między jednym obrotem a drugim. */
    zaznaczRuch(260);
    zoomAt(factor, x, y);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const { x, y } = relative(event);
    const target = renderer.screenToAltAz(x, y);
    useSkyStore.getState().setView({ azimuth: target.azimuth, altitude: target.altitude });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const store = useSkyStore.getState();
    const step = KEY_PAN_DEG * (event.shiftKey ? 3 : 1) * (store.view.fov / 100);

    /*
     * Strzałki nadają kamerze prędkość zamiast przestawiać ją skokiem.
     *
     * Wcześniej każde naciśnięcie przesuwało widok o stały kąt natychmiast, więc trzymanie
     * strzałki dawało serię szarpnięć w rytm powtarzania klawisza, a nie ruch. Teraz
     * naciśnięcie dokłada prędkości do tego samego wybiegu, którym posługuje się myszka:
     * pojedyncze stuknięcie daje krótkie sunięcie, a trzymanie klawisza rozpędza kamerę
     * i po puszczeniu sama wyhamowuje.
     *
     * Przy zredukowanym ruchu wracamy do skoku, bo płynne sunięcie jest dokładnie tym,
     * czego to ustawienie każe unikać.
     */
    const nadaj = (az: number, alt: number) => {
      if (reducedMotion) {
        store.panBy(az, alt);
        return;
      }
      const maks = store.view.fov / 285;
      const w = wybiegRef.current;
      w.az = Math.max(-maks, Math.min(maks, w.az + az / 160));
      w.alt = Math.max(-maks, Math.min(maks, w.alt + alt / 160));
      zaznaczRuch();
    };

    switch (event.key) {
      case 'ArrowLeft':
        nadaj(-step, 0);
        break;
      case 'ArrowRight':
        nadaj(step, 0);
        break;
      case 'ArrowUp':
        nadaj(0, step);
        break;
      case 'ArrowDown':
        nadaj(0, -step);
        break;
      case '+':
      case '=':
        store.zoomBy(1 / KEY_ZOOM_FACTOR);
        break;
      case '-':
      case '_':
        store.zoomBy(KEY_ZOOM_FACTOR);
        break;
      case 'Escape':
        store.select(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className={styles.root}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${pointing ? styles.pointing : ''}`}
        tabIndex={0}
        role="application"
        aria-label="Interaktywna mapa nieba. Strzałki obracają widok, klawisze plus i minus zmieniają przybliżenie, Escape czyści zaznaczenie."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export type { SkyObjectRef };
