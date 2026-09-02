/*
 * Barwa nieba w zależności od wysokości Słońca.
 *
 * Wartości dobrane tak, żeby przejście od dnia przez zmierzch do nocy było ciągłe
 * i żeby noc astronomiczna miała ten sam granat co reszta interfejsu. Nie jest to
 * symulacja rozpraszania Rayleigha, tylko kontrolowana interpolacja między
 * kilkoma punktami odniesienia.
 */

export interface SkyTint {
  /** Kolor zenitu. */
  zenith: [number, number, number];
  /** Kolor przy horyzoncie. */
  horizon: [number, number, number];
  /** Siła poświaty w miejscu, gdzie Słońce jest lub było pod horyzontem. */
  glow: number;
  /** Barwa poświaty zmierzchowej. */
  glowColor: [number, number, number];
  /** Jak bardzo tło rozjaśnia gwiazdy, od 0 w nocy do 1 w dzień. */
  washout: number;
  /*
   * Barwa gruntu.
   *
   * Prawie czerń, i to nie jest uproszczenie, tylko odwzorowanie tego, co widzi oko.
   * Teren oglądany na tle jasnego nieba jest podświetlony od tyłu i oko, nastawione
   * na jasność nieba, odczytuje go jako ciemną sylwetkę. Tak samo działa aparat:
   * przy ekspozycji na niebo pierwszy plan wychodzi czarny.
   *
   * Wcześniej grunt jaśniał razem ze Słońcem aż do oliwkowej szarości. Było to poprawne
   * jako model odbicia światła, ale fałszywe jako obraz: szara połowa ekranu odciągała
   * wzrok od nieba, czyli od jedynej rzeczy, którą ta mapa ma pokazywać. Zostaje więc
   * czerń z ledwie wyczuwalnym pogodowym odcieniem, a czytelność krawędzi bierze się
   * z rozjaśnionej linii horyzontu, nie z jasności samego gruntu.
   */
  ground: [number, number, number];
}

interface Stop {
  alt: number;
  zenith: [number, number, number];
  horizon: [number, number, number];
  glow: number;
  glowColor: [number, number, number];
  washout: number;
  ground: [number, number, number];
}

const STOPS: Stop[] = [
  { alt: -18, zenith: [10, 13, 22], horizon: [16, 21, 34], glow: 0, glowColor: [40, 44, 66], washout: 0, ground: [4, 5, 8] },
  { alt: -12, zenith: [12, 16, 30], horizon: [26, 33, 54], glow: 0.25, glowColor: [58, 60, 88], washout: 0.08, ground: [5, 6, 9] },
  { alt: -6, zenith: [18, 26, 48], horizon: [50, 58, 88], glow: 0.55, glowColor: [110, 96, 116], washout: 0.28, ground: [6, 7, 10] },
  { alt: -0.8, zenith: [34, 52, 92], horizon: [126, 108, 122], glow: 0.9, glowColor: [196, 132, 108], washout: 0.62, ground: [8, 8, 10] },
  { alt: 6, zenith: [58, 96, 152], horizon: [150, 158, 176], glow: 0.5, glowColor: [214, 176, 138], washout: 0.9, ground: [9, 9, 11] },
  { alt: 30, zenith: [64, 112, 178], horizon: [158, 180, 202], glow: 0.2, glowColor: [220, 210, 190], washout: 1, ground: [10, 10, 12] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

export function skyTint(sunAltitude: number): SkyTint {
  if (sunAltitude <= STOPS[0].alt) {
    const s = STOPS[0];
    return { zenith: s.zenith, horizon: s.horizon, glow: s.glow, glowColor: s.glowColor, washout: s.washout, ground: s.ground };
  }
  const last = STOPS[STOPS.length - 1];
  if (sunAltitude >= last.alt) {
    return {
      zenith: last.zenith,
      horizon: last.horizon,
      glow: last.glow,
      glowColor: last.glowColor,
      washout: last.washout,
      ground: last.ground,
    };
  }
  for (let i = 1; i < STOPS.length; i++) {
    const b = STOPS[i];
    if (sunAltitude <= b.alt) {
      const a = STOPS[i - 1];
      const t = (sunAltitude - a.alt) / (b.alt - a.alt);
      return {
        zenith: lerp3(a.zenith, b.zenith, t),
        horizon: lerp3(a.horizon, b.horizon, t),
        glow: lerp(a.glow, b.glow, t),
        glowColor: lerp3(a.glowColor, b.glowColor, t),
        washout: lerp(a.washout, b.washout, t),
        ground: lerp3(a.ground, b.ground, t),
      };
    }
  }
  const s = STOPS[0];
  return { zenith: s.zenith, horizon: s.horizon, glow: s.glow, glowColor: s.glowColor, washout: s.washout, ground: s.ground };
}

export const rgb = ([r, g, b]: [number, number, number], alpha = 1): string =>
  alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
