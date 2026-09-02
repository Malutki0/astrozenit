import { useEffect, useState } from 'react';

import { loadPhotos, type Photo } from '@/lib/photos';

let wspolne: Record<string, Photo> | null = null;

/**
 * Udostępnia spis zdjęć sekcjom.
 *
 * Manifest jest wspólny dla całej aplikacji i wczytywany raz. Pierwszy komponent,
 * który go potrzebuje, uruchamia pobranie; kolejne dostają gotowy wynik bez czekania,
 * bo przechowujemy go poza drzewem Reacta.
 */
export function usePhotos(): Record<string, Photo> {
  const [spis, setSpis] = useState<Record<string, Photo>>(wspolne ?? {});

  useEffect(() => {
    if (wspolne) return;
    let aktualny = true;
    void loadPhotos().then((wynik) => {
      wspolne = wynik;
      if (aktualny) setSpis(wynik);
    });
    return () => {
      aktualny = false;
    };
  }, []);

  return spis;
}
