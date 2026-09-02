import type { Photo } from '@/lib/photos';

import styles from './ui.module.css';

interface PhotoFrameProps {
  photo: Photo | undefined;
  /** Opis dla czytnika ekranu. Zawsze nazwa obiektu, nigdy słowo "zdjęcie". */
  alt: string;
  /** Proporcje ramki. Domyślnie szerokie, bo takie są zdjęcia astronomiczne. */
  ratio?: string;
  /** Podpis z licencją da się schować tam, gdzie stoi obok innego. */
  hideCredit?: boolean;
}

/**
 * Zdjęcie obiektu w szklanej ramce.
 *
 * Trzy rzeczy dzieją się tu celowo.
 *
 * Po pierwsze, brak zdjęcia nie jest błędem. Nie każdy obiekt ma zdjęcie na wolnej
 * licencji, a sekcja ma wtedy wyglądać tak, jakby zdjęcia nigdy nie planowano,
 * zamiast pokazywać pustą ramkę albo ikonę zepsutego obrazka.
 *
 * Po drugie, ramka ma z góry ustalone proporcje. Bez tego wczytanie zdjęcia
 * przesuwałoby treść pod spodem, co przy przewijaniu listy jest wyjątkowo
 * nieprzyjemne: czytasz opis, a on ucieka w dół.
 *
 * Po trzecie, podpis z autorem i licencją jest częścią komponentu, a nie czymś,
 * co wywołujący może dodać. Licencje Creative Commons wymagają go przy każdym
 * wyświetleniu, więc możliwość jego pominięcia byłaby zaproszeniem do złamania
 * warunków, na jakich to zdjęcie w ogóle wolno pokazać.
 */
export function PhotoFrame({ photo, alt, ratio = '16 / 10', hideCredit }: PhotoFrameProps) {
  if (!photo) return null;

  return (
    <figure className={styles.photoFigure}>
      <div className={styles.photoFrame} style={{ aspectRatio: ratio }}>
        <img
          src={photo.src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={styles.photoImage}
        />
      </div>
      {!hideCredit && (
        <figcaption className={styles.photoCredit}>
          <a href={photo.zrodlo} target="_blank" rel="noreferrer noopener">
            {photo.autor}
          </a>
          , {photo.licencja}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Miniatura do listy. Ta sama zasada co wyżej: bez zdjęcia zwraca nic,
 * więc wiersz listy wygląda jak przed dodaniem zdjęć, a nie jak zepsuty.
 */
export function PhotoThumb({
  photo,
  alt,
  size = 74,
}: {
  photo: Photo | undefined;
  alt: string;
  size?: number;
}) {
  if (!photo) return null;

  return (
    <img
      src={photo.src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className={styles.photoThumb}
    />
  );
}
