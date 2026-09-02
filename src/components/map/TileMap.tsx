import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui';
import {
  latToTileY,
  lonToTileX,
  MAX_LATITUDE,
  metersPerPixel,
  tileXToLon,
  tileYToLat,
} from '@/lib/map/mercator';

import styles from './TileMap.module.css';

/*
 * Mapa kafelkowa na płótnie.
 *
 * Napisana od zera zamiast sięgnięcia po gotową bibliotekę, z trzech powodów.
 *
 * Po pierwsze, potrzebne są tylko trzy rzeczy: przesuwanie, przybliżanie i wskazanie
 * punktu. Gotowe biblioteki dokładają do tego kilkadziesiąt kilobajtów kodu obsługującego
 * warstwy, znaczniki, okienka i wtyczki, z których nic tu nie jest używane.
 *
 * Po drugie, warstwa zachmurzenia musi być rysowana na tym samym płótnie co mapa
 * i w tym samym odwzorowaniu. Przy gotowej bibliotece trzeba by to robić przez jej
 * wewnętrzne mechanizmy warstw, czyli i tak pisać kod dopasowany do jej modelu.
 *
 * Po trzecie, aplikacja ma własny język wizualny i własną obsługę gestów w mapie nieba.
 * Ten sam sposób sterowania w obu miejscach jest wart więcej niż oszczędność kodu.
 *
 * Kafelki pochodzą z OpenStreetMap. Sprawdzałem wcześniej CARTO, bo ma gotowy motyw
 * ciemny, ale ich kafelki wracają dziś ze znakiem wodnym żądającym klucza dostępu.
 * OpenStreetMap nie wymaga klucza, za to jego mapa jest jasna, więc przyciemniamy ją
 * filtrem płótna: odwrócenie barw, obrót odcienia o sto osiemdziesiąt stopni i lekkie
 * przygaszenie. Wychodzi z tego granat zgodny z resztą aplikacji, a podpisy miejscowości
 * zostają czytelne. Filtr działa na etapie rysowania, więc nie wymaga odczytu pikseli
 * i nie zderza się z zasadami dostępu do zasobów z innej domeny.
 *
 * Wymagane oznaczenie źródła jest stale widoczne w rogu.
 */

const TILE_SIZE = 256;
const TILE_URL = (z: number, x: number, y: number) =>
  `https://${'abc'[(x + y) % 3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

/*
 * Barwy kafelków zostawiamy takie, jakie przychodzą z OpenStreetMap.
 *
 * Była tu wcześniej przeróbka na ciemny granat, żeby mapa nie rozświetlała ekranu przy
 * obserwacji nocnej. Sprawdzona na żywo okazała się gorsza od tego, co miała naprawić:
 * po odwróceniu barw nazwy miejscowości robią się jasnoniebieskie na prawie czarnym tle
 * i przy rozmiarze, jaki mają na kafelku, przestają być czytelne. A mapa regionu służy
 * wyłącznie do jednego, do odczytania, dokąd jechać po czystsze niebo, więc mapa
 * nieczytelna nie służy do niczego.
 *
 * Jasna mapa rzeczywiście świeci mocniej niż reszta aplikacji, ale leży w osobnej sekcji,
 * którą otwiera się na chwilę przy planowaniu wyjazdu, a nie w widoku nieba, przy którym
 * siedzi się godzinami. Czytelność wygrywa z adaptacją wzroku w miejscu, w którym mapa
 * i tak jest oglądana przed wyjściem, a nie w polu.
 */

export const MAP_ATTRIBUTION = 'Mapa: OpenStreetMap, licencja ODbL';

const MIN_ZOOM = 3;
const MAX_ZOOM = 14;

/* Wspólna pamięć obrazów kafelków. Przeżywa odmontowanie komponentu,
 * więc powrót do mapy nie pobiera niczego ponownie. */
const tileCache = new Map<string, HTMLImageElement>();
/* Kafelki, których pobranie się nie udało. Bez tego próbowalibyśmy w kółko. */
const failedTiles = new Set<string>();

function getTile(z: number, x: number, y: number, onLoad: () => void) {
  const key = `${z}/${x}/${y}`;
  if (failedTiles.has(key)) return null;
  const cached = tileCache.get(key);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;

  const img = new Image();
  img.onload = onLoad;
  img.onerror = () => {
    failedTiles.add(key);
    tileCache.delete(key);
  };
  img.src = TILE_URL(z, x, y);
  tileCache.set(key, img);
  return null;
}

export interface TileMapProps {
  lat: number;
  lon: number;
  zoom: number;
  /** Wywoływane po przesunięciu albo przybliżeniu mapy. */
  onViewChange: (view: { lat: number; lon: number; zoom: number }) => void;
  /** Wywoływane po wskazaniu punktu, czyli po kliknięciu bez przeciągania. */
  onPick?: (lat: number, lon: number) => void;
  /** Znacznik rysowany na mapie. */
  marker?: { lat: number; lon: number; label?: string } | null;
  /** Dodatkowa warstwa rysowana nad kafelkami, na przykład zachmurzenie. */
  overlay?: (context: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    /** Zamienia współrzędne geograficzne na piksele płótna. */
    project: (lat: number, lon: number) => { x: number; y: number };
    dpr: number;
  }) => void;
  height?: number;
  /** Podpis wyjaśniający, co można na mapie zrobić. */
  hint?: string;
  /*
   * Legenda warstwy danych, rysowana w lewym górnym rogu.
   *
   * Warstwa nałożona na mapę jest nieczytelna bez skali: plama o danej jasności nic
   * nie znaczy, dopóki nie wiadomo, jakiej wartości odpowiada. Legenda zajmuje przy tym
   * ułamek miejsca, które zabierałoby zdanie tłumaczące to samo słowami.
   */
  legend?: React.ReactNode;
  /*
   * Zakres powiększenia. Domyślnie cały dostępny, ale warstwa danych o ograniczonym
   * zasięgu może go zawęzić: oddalanie mapy poza obszar, dla którego mamy dane,
   * pokazuje tylko, jak mało ich mamy, i wygląda na usterkę.
   */
  minZoom?: number;
  maxZoom?: number;
}

export function TileMap({
  lat,
  lon,
  zoom,
  onViewChange,
  onPick,
  marker,
  overlay,
  height = 320,
  hint,
  legend,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
}: TileMapProps) {
  const dolnyZoom = Math.max(MIN_ZOOM, minZoom);
  const gornyZoom = Math.min(MAX_ZOOM, maxZoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  /* Stan gestów trzymamy poza Reactem, żeby przeciąganie nie renderowało komponentu. */
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const viewRef = useRef({ lat, lon, zoom });
  viewRef.current = { lat, lon, zoom };

  /* Przerysowanie po doczytaniu kafelka. Licznik wymusza nowy przebieg rysowania. */
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Rysowanie mapy. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /*
     * Rozmiar płótna zmieniamy tylko wtedy, gdy naprawdę się zmienił.
     *
     * Przypisanie do canvas.width albo canvas.height czyści całą zawartość i na nowo
     * przydziela bufor obrazu, nawet gdy przypisywana jest ta sama liczba. Robiliśmy
     * to przy każdym przebiegu rysowania, a przy przeciąganiu mapy przebieg wypada
     * po każdym ruchu palca, czyli kilkadziesiąt razy na sekundę. Stąd brały się
     * i szarpanie, i miganie kafelków: co ruch płótno zaczynało od pustego.
     */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const szerokoscPx = Math.round(size.width * dpr);
    const wysokoscPx = Math.round(size.height * dpr);
    if (canvas.width !== szerokoscPx || canvas.height !== wysokoscPx) {
      canvas.width = szerokoscPx;
      canvas.height = wysokoscPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /*
     * Kafelki pobieramy dla całkowitego powiększenia, a ułamkową część skali
     * odrabiamy skalowaniem obrazu. Dzięki temu przybliżanie jest płynne,
     * a nie skokowe co pełny poziom.
     */
    const intZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
    const scale = Math.pow(2, zoom - intZoom);
    const drawnTile = TILE_SIZE * scale;

    const centerX = lonToTileX(lon, intZoom);
    const centerY = latToTileY(lat, intZoom);

    ctx.fillStyle = 'rgb(12 16 26)';
    ctx.fillRect(0, 0, size.width, size.height);

    const half = { x: size.width / 2, y: size.height / 2 };
    const worldTiles = Math.pow(2, intZoom);
    const cols = Math.ceil(size.width / drawnTile) + 2;
    const rows = Math.ceil(size.height / drawnTile) + 2;
    const firstX = Math.floor(centerX - cols / 2);
    const firstY = Math.floor(centerY - rows / 2);

    ctx.imageSmoothingEnabled = true;
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const tx = firstX + col;
        const ty = firstY + row;
        if (ty < 0 || ty >= worldTiles) continue;
        /* Południki zawijają się wokół świata, równoleżniki nie. */
        const wrapped = ((tx % worldTiles) + worldTiles) % worldTiles;
        const px = half.x + (tx - centerX) * drawnTile;
        const py = half.y + (ty - centerY) * drawnTile;
        const img = getTile(intZoom, wrapped, ty, bump);
        if (img) {
          /* Pół piksela zapasu usuwa włoskowate szpary między kafelkami
           * przy ułamkowym powiększeniu. */
          ctx.drawImage(img, px, py, drawnTile + 0.5, drawnTile + 0.5);
          continue;
        }

        /*
         * Kafelek jeszcze się nie doczytał. Zamiast zostawić czarną dziurę,
         * wycinamy odpowiadający mu fragment z kafelka o poziom niższego, który
         * prawie zawsze jest już w pamięci, bo pokrywa cztery razy większy obszar.
         * Obraz jest rozmyty, ale pokazuje właściwe miejsce, a po doczytaniu
         * wyostrza się bez przeskoku. Tak działa każda mapa kafelkowa i to jest
         * różnica między "mapa się doczytuje" a "mapa miga".
         */
        const rodzicZ = intZoom - 1;
        if (rodzicZ < MIN_ZOOM) continue;
        const rodzic = getTile(rodzicZ, wrapped >> 1, ty >> 1, bump);
        if (!rodzic) continue;
        const polowa = TILE_SIZE / 2;
        ctx.drawImage(
          rodzic,
          (wrapped & 1) * polowa,
          (ty & 1) * polowa,
          polowa,
          polowa,
          px,
          py,
          drawnTile + 0.5,
          drawnTile + 0.5,
        );
      }
    }
    const project = (plat: number, plon: number) => ({
      x: half.x + (lonToTileX(plon, intZoom) - centerX) * drawnTile,
      y: half.y + (latToTileY(plat, intZoom) - centerY) * drawnTile,
    });

    if (overlay) {
      ctx.save();
      overlay({ ctx, width: size.width, height: size.height, project, dpr });
      ctx.restore();
    }

    if (marker) {
      const { x, y } = project(marker.lat, marker.lon);
      ctx.save();
      /* Pinezka: pionowa nóżka i kółko, obrysowane ciemnym konturem,
       * żeby były czytelne i na jasnym, i na ciemnym tle. */
      ctx.strokeStyle = 'rgb(10 13 22 / 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 18);
      ctx.stroke();
      ctx.strokeStyle = 'rgb(10 13 22 / 0.85)';
      ctx.beginPath();
      ctx.arc(x, y - 22, 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgb(240 190 110)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 18);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgb(240 190 110)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 22, 5, 0, Math.PI * 2);
      ctx.fill();
      /* Punkt dokładnego trafienia, żeby było widać, gdzie naprawdę jest wskazane miejsce. */
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* Podziałka. W odwzorowaniu Merkatora skala zależy od szerokości, więc liczymy ją
     * dla środka kadru, a nie raz na zawsze. */
    const mpp = metersPerPixel(lat, zoom);
    const targetPx = 90;
    const rawMeters = mpp * targetPx;
    const pow = Math.pow(10, Math.floor(Math.log10(rawMeters)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= rawMeters) ?? pow * 10;
    const barPx = nice / mpp;
    const bx = 12;
    const by = size.height - 14;
    ctx.save();
    ctx.strokeStyle = 'rgb(226 232 246 / 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.lineTo(bx + barPx, by - 4);
    ctx.stroke();
    ctx.fillStyle = 'rgb(226 232 246 / 0.75)';
    ctx.font =
      '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, bx + 3, by - 6);
    ctx.restore();
  }, [size, lat, lon, zoom, marker, overlay, revision, bump]);

  /* ------------------------------------------------------------------ gesty */

  const moveBy = (dxPixels: number, dyPixels: number) => {
    const v = viewRef.current;
    const intZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(v.zoom)));
    const scale = Math.pow(2, v.zoom - intZoom);
    const drawnTile = TILE_SIZE * scale;
    const cx = lonToTileX(v.lon, intZoom) - dxPixels / drawnTile;
    const cy = latToTileY(v.lat, intZoom) - dyPixels / drawnTile;
    const worldTiles = Math.pow(2, intZoom);
    onViewChange({
      lon: tileXToLon(((cx % worldTiles) + worldTiles) % worldTiles, intZoom),
      lat: Math.max(
        -MAX_LATITUDE,
        Math.min(MAX_LATITUDE, tileYToLat(Math.max(0, Math.min(worldTiles, cy)), intZoom)),
      ),
      zoom: v.zoom,
    });
  };

  const pointToLatLon = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    const intZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(v.zoom)));
    const drawnTile = TILE_SIZE * Math.pow(2, v.zoom - intZoom);
    const dx = clientX - rect.left - rect.width / 2;
    const dy = clientY - rect.top - rect.height / 2;
    return {
      lat: tileYToLat(latToTileY(v.lat, intZoom) + dy / drawnTile, intZoom),
      lon: tileXToLon(lonToTileX(v.lon, intZoom) + dx / drawnTile, intZoom),
    };
  };

  const zoomBy = (delta: number, clientX?: number, clientY?: number) => {
    const v = viewRef.current;
    /* Ograniczenie stosujemy raz, na samym początku, żeby dalsza część funkcji
     * miała już do czynienia wyłącznie z wartością dopuszczalną. */
    const next = Math.max(dolnyZoom, Math.min(gornyZoom, v.zoom + delta));
    if (next === v.zoom) return;
    /* Przybliżanie zakotwiczone we wskaźniku: punkt pod kursorem ma zostać
     * w tym samym miejscu ekranu. */
    if (clientX !== undefined && clientY !== undefined) {
      const before = pointToLatLon(clientX, clientY);
      onViewChange({ ...v, zoom: next });
      if (before) {
        requestAnimationFrame(() => {
          viewRef.current = { ...viewRef.current, zoom: next };
          const after = pointToLatLon(clientX, clientY);
          if (!after) return;
          onViewChange({
            zoom: next,
            lat: viewRef.current.lat + (before.lat - after.lat),
            lon: viewRef.current.lon + (before.lon - after.lon),
          });
        });
      }
      return;
    }
    onViewChange({ ...v, zoom: next });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: viewRef.current.zoom };
      dragRef.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / (pinchRef.current.distance || 1);
      const next = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinchRef.current.zoom + Math.log2(ratio)),
      );
      onViewChange({ ...viewRef.current, zoom: next });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    moveBy(dx, dy);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) dragRef.current = null;

    /* Kliknięcie odróżniamy od przeciągnięcia progiem przesunięcia,
     * bo palec nigdy nie stoi idealnie nieruchomo. */
    if (drag && drag.moved < 6 && onPick) {
      const point = pointToLatLon(event.clientX, event.clientY);
      if (point) onPick(point.lat, point.lon);
    }
  };

  return (
    <div className={styles.wrap} style={{ height }} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: '100%', height: '100%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          e.preventDefault();
          zoomBy(e.deltaY > 0 ? -0.4 : 0.4, e.clientX, e.clientY);
        }}
        onDoubleClick={(e) => zoomBy(1, e.clientX, e.clientY)}
        role="application"
        aria-label="Mapa. Przeciąganie przesuwa, kółko przybliża, kliknięcie wskazuje miejsce."
      />

      <div className={styles.zoomButtons}>
        <button type="button" onClick={() => zoomBy(1)} aria-label="Przybliż mapę">
          <Icon name="plus" size={16} />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Oddal mapę">
          <Icon name="minus" size={16} />
        </button>
      </div>

      {hint && <p className={styles.hint}>{hint}</p>}
      {legend && <div className={styles.legend}>{legend}</div>}
      <p className={styles.attribution}>{MAP_ATTRIBUTION}</p>
    </div>
  );
}
