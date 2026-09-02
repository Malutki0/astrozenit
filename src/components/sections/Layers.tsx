import { Panel } from '@/components/shell/Panel';
import { Slider, Toggle } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import type { SkyLayers } from '@/lib/render/types';
import { useSkyStore } from '@/state/useSkyStore';

import styles from './sections.module.css';

const LAYERS: { key: keyof SkyLayers; label: string; hint: string }[] = [
  { key: 'constellations', label: 'Linie gwiazdozbiorów', hint: 'Figury w wersji Międzynarodowej Unii Astronomicznej.' },
  { key: 'constellationNames', label: 'Nazwy gwiazdozbiorów', hint: 'Znikają przy dużym przybliżeniu, gdy tracą sens.' },
  { key: 'boundaries', label: 'Granice gwiazdozbiorów', hint: 'Oficjalny podział nieba z 1930 roku, przeliczony na epokę J2000.' },
  { key: 'asterisms', label: 'Asteryzmy', hint: 'Wielki Wóz, Trójkąt Letni i inne układy spoza podziału formalnego.' },
  { key: 'starNames', label: 'Nazwy gwiazd', hint: 'Liczba podpisów rośnie wraz z przybliżeniem.' },
  { key: 'deepSky', label: 'Obiekty Messiera', hint: 'Mgławice, gromady i galaktyki z katalogu Messiera.' },
  { key: 'milkyWay', label: 'Droga Mleczna', hint: 'Pas naszej galaktyki, rozłożony wzdłuż równika galaktycznego.' },
  { key: 'grid', label: 'Siatka horyzontalna', hint: 'Okręgi stałej wysokości i linie stałego azymutu.' },
  { key: 'horizon', label: 'Horyzont i grunt', hint: 'Linia horyzontu, kierunki świata i przesłonięcie tego, co pod ziemią.' },
  { key: 'atmosphere', label: 'Zjawiska atmosferyczne', hint: 'Poświata zmierzchowa i osłabienie blasku przy horyzoncie.' },
  {
    key: 'satellites',
    label: 'Satelity',
    hint: 'Sztuczne satelity Ziemi, liczone z elementów orbitalnych pobranych z sieci. Wymaga połączenia.',
  },
];

export function LayersSection({ onClose }: { onClose: () => void }) {
  const layers = useSkyStore((s) => s.layers);
  const setLayer = useSkyStore((s) => s.setLayer);
  const nightMode = useSkyStore((s) => s.nightMode);
  const setNightMode = useSkyStore((s) => s.setNightMode);
  const magLimit = useSkyStore((s) => s.magLimit);
  const setMagLimit = useSkyStore((s) => s.setMagLimit);

  return (
    <Panel eyebrow="Ustawienia mapy" title="Warstwy" onClose={onClose}>
      <div className={styles.stack}>
        <div className={styles.toggles}>
          <Toggle label="Tryb czerwony" checked={nightMode} onChange={setNightMode} />
          <p className={styles.toggleHint}>
            Barwi cały ekran na czerwono. Oko przystosowuje się do ciemności dwadzieścia
            do trzydziestu minut, a traci to przystosowanie w kilka sekund po spojrzeniu
            w jasny ekran. Czerwone światło prawie nie pobudza pręcików odpowiedzialnych
            za widzenie nocne, więc pozwala korzystać z mapy w terenie bez zaczynania
            adaptacji od nowa.
          </p>
        </div>

        <div className={styles.divider} />

        <div>
          <Slider
            label="Najsłabsze pokazywane gwiazdy"
            value={magLimit}
            min={2}
            max={6.5}
            step={0.1}
            onChange={setMagLimit}
            format={(v) => `${formatNumber(v, 1)} mag`}
          />
          <p className={styles.hint}>
            Katalog sięga wielkości 6,5, czyli granicy widoczności gołym okiem przy bardzo
            ciemnym niebie. Przy szerokim kadrze mapa i tak przycina najsłabsze gwiazdy,
            żeby obraz pozostał czytelny.
          </p>
        </div>

        <div className={styles.divider} />

        <div className={styles.toggles}>
          {LAYERS.map((layer) => (
            <div key={layer.key}>
              <Toggle
                label={layer.label}
                checked={layers[layer.key]}
                onChange={(value) => setLayer(layer.key, value)}
              />
              <p className={styles.toggleHint}>{layer.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
