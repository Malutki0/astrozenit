import { useEffect, useState } from 'react';

import { loadImages, type StoredImage } from '@/lib/media';

/**
 * Wczytuje zdjęcia o podanych identyfikatorach z bazy przeglądarki.
 *
 * Klucz zależności jest sklejonym łańcuchem identyfikatorów, a nie samą tablicą,
 * bo tablica przy każdym renderowaniu jest nowym obiektem i uruchamiałaby odczyt
 * bez końca.
 */
export function useImages(ids: (string | undefined)[]): Map<string, StoredImage> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  const key = wanted.join(',');
  const [images, setImages] = useState<Map<string, StoredImage>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setImages(new Map());
      return;
    }
    void loadImages(key.split(',')).then((result) => {
      if (!cancelled) setImages(result);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return images;
}
