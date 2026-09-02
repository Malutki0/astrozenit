import { useEffect, useRef } from 'react';

import { starColor } from '@/lib/render/sprites';

import styles from './PlanetGlobe.module.css';

/*
 * TARCZA GWIAZDY
 *
 * DLACZEGO NIE ZDJĘCIE
 *
 * Fotografii gwiazd nie ma i nie będzie. Poza Słońcem żadna nie ma dostrzegalnej
 * tarczy: Betelgeza, gwiazda o największej średnicy kątowej na całym niebie, widziana
 * z Ziemi ma pięćdziesiąt milisekund łuku, czyli tyle, co moneta dwuzłotowa oglądana
 * z odległości stu kilometrów. Nawet największe teleskopy widzą tam punkt, a to,
 * co w sieci uchodzi za zdjęcia gwiazd, jest albo mapą gwiazdozbioru z zaznaczoną
 * pozycją, albo wizją artysty.
 *
 * CO JEST ZAMIAST
 *
 * Rysunek liczony z pomiarów tej konkretnej gwiazdy, a nie obrazek dobrany do niej
 * z zewnątrz. Wchodzą do niego dwie wielkości, obie z katalogu:
 *
 * Barwa bierze się z indeksu B-V, czyli z różnicy jasności zmierzonej przez filtr
 * niebieski i przez żółty. Jest to wielkość ściśle powiązana z temperaturą powierzchni:
 * B-V równe zero odpowiada około dziesięciu tysiącom kelwinów i barwie białoniebieskiej,
 * półtora około trzem i pół tysiąca i barwie pomarańczowoczerwonej. Ta sama funkcja
 * zamienia B-V na barwę na mapie nieba, więc gwiazda w spisie i na niebie ma ten sam kolor.
 *
 * Pociemnienie brzegowe to zjawisko, przez które tarcza jest jaśniejsza w środku
 * niż przy krawędzi. Patrząc w środek tarczy widzimy głębiej i cieplej, patrząc przy
 * brzegu przez ukośną, chłodniejszą warstwę. Widać to na każdym zdjęciu Słońca i to
 * ono sprawia, że kula wygląda na kulę, a nie na krążek.
 *
 * Korona wokół tarczy nie jest ozdobą: gwiazda o jasności pierwszej wielkości daje
 * w oku i w obiektywie wyraźną poświatę, i to ona, a nie średnica tarczy, decyduje
 * o tym, jak duża wydaje się na niebie.
 *
 * Rysunek jest uczciwszy od fotografii, bo nie udaje, że pokazuje coś, czego nikt
 * nie sfotografował, a każda jego cecha wynika z liczby zmierzonej dla tej gwiazdy.
 */

const ROZDZIELCZOSC = 220;

export interface StarDiscProps {
  /** Indeks barwy B-V z katalogu. Brak pomiaru daje barwę neutralną. */
  colorIndex: number | null;
  /** Obserwowana wielkość gwiazdowa. Steruje wielkością korony. */
  magnitude: number | null;
  size?: number;
  /** Nazwa do odczytu przez czytnik ekranu. */
  label: string;
}

export function StarDisc({ colorIndex, magnitude, size = 168, label }: StarDiscProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const [r, g, b] = starColor(colorIndex ?? Number.NaN);
    const srodek = ROZDZIELCZOSC / 2;

    /*
     * Promień tarczy i zasięg korony.
     *
     * Tarcza jest umowna, bo prawdziwa jest punktem. Korona rośnie wraz z jasnością
     * i to jest jedyna rzecz w tym rysunku odwzorowująca to, co widać: Syriusz przy
     * jasności minus półtorej wielkości ma poświatę wypełniającą kadr, a gwiazda
     * czwartej wielkości ledwie odróżnia się od punktu.
     */
    const jasnosc = magnitude === null ? 2 : Math.max(-1.5, Math.min(6, magnitude));
    const sila = Math.max(0.2, Math.min(1, (6 - jasnosc) / 7.5));
    const promienTarczy = ROZDZIELCZOSC * (0.15 + 0.05 * sila);
    const promienKorony = ROZDZIELCZOSC * (0.26 + 0.22 * sila);

    ctx.clearRect(0, 0, ROZDZIELCZOSC, ROZDZIELCZOSC);

    /* Korona: miękka poświata gasnąca z kwadratem odległości, jak rozproszenie
     * światła w atmosferze i w układzie optycznym oka. */
    const korona = ctx.createRadialGradient(
      srodek,
      srodek,
      promienTarczy * 0.6,
      srodek,
      srodek,
      promienKorony,
    );
    korona.addColorStop(0, `rgb(${r} ${g} ${b} / ${0.5 * sila})`);
    korona.addColorStop(0.42, `rgb(${r} ${g} ${b} / ${0.16 * sila})`);
    korona.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    ctx.fillStyle = korona;
    ctx.fillRect(0, 0, ROZDZIELCZOSC, ROZDZIELCZOSC);

    /*
     * Tarcza z pociemnieniem brzegowym. Wzór z prawa Eddingtona w postaci
     * uproszczonej: jasność maleje jak 0,4 plus 0,6 razy cosinus kąta między
     * kierunkiem patrzenia a normalną do powierzchni. Środek tarczy jest więc
     * dwa i pół raza jaśniejszy od samego brzegu.
     */
    const obraz = ctx.getImageData(0, 0, ROZDZIELCZOSC, ROZDZIELCZOSC);
    const dane = obraz.data;
    for (let y = 0; y < ROZDZIELCZOSC; y++) {
      for (let x = 0; x < ROZDZIELCZOSC; x++) {
        const dx = (x + 0.5 - srodek) / promienTarczy;
        const dy = (y + 0.5 - srodek) / promienTarczy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;

        const mu = Math.sqrt(1 - d2);
        const jasnoscPunktu = 0.4 + 0.6 * mu;
        /* Wygładzenie krawędzi na szerokości jednego piksela. */
        const brzeg = Math.min(1, (1 - Math.sqrt(d2)) * promienTarczy);

        const i = (y * ROZDZIELCZOSC + x) * 4;
        const nowaR = Math.min(255, 90 + r * jasnoscPunktu * 0.95);
        const nowaG = Math.min(255, 90 + g * jasnoscPunktu * 0.95);
        const nowaB = Math.min(255, 90 + b * jasnoscPunktu * 0.95);
        const a = brzeg;
        dane[i] = nowaR * a + dane[i] * (1 - a);
        dane[i + 1] = nowaG * a + dane[i + 1] * (1 - a);
        dane[i + 2] = nowaB * a + dane[i + 2] * (1 - a);
        dane[i + 3] = Math.max(dane[i + 3], 255 * a);
      }
    }
    ctx.putImageData(obraz, 0, 0);
  }, [colorIndex, magnitude]);

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={ROZDZIELCZOSC}
        height={ROZDZIELCZOSC}
        className={`${styles.canvas} ${styles.canvasStill}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}: barwa i jasność odwzorowane z pomiarów katalogowych`}
      />
    </div>
  );
}
