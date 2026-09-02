import { useEffect, useState } from 'react';

import { loadCatalog } from '@/lib/catalog/loadCatalog';
import type { CatalogBundle } from '@/lib/catalog/types';

type CatalogStatus =
  | { status: 'loading'; catalog: null; error: null }
  | { status: 'ready'; catalog: CatalogBundle; error: null }
  | { status: 'error'; catalog: null; error: Error };

/** Wczytuje katalog raz na całą sesję i udostępnia go komponentom. */
export function useCatalog(): CatalogStatus {
  const [state, setState] = useState<CatalogStatus>({ status: 'loading', catalog: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setState({ status: 'ready', catalog, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', catalog: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
