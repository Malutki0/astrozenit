/*
 * Własny zestaw ikon. Jedna grubość kreski dla całego zestawu, jedna siatka 24 na 24,
 * zaokrąglone zakończenia. Rezygnujemy z gotowych bibliotek, bo ich domyślny wygląd
 * jest natychmiast rozpoznawalny i rozmywa charakter interfejsu.
 */

export type IconName =
  | 'map'
  | 'planet'
  | 'star'
  | 'constellation'
  | 'moon'
  | 'sparkle'
  | 'calendar'
  | 'search'
  | 'eye'
  | 'layers'
  | 'location'
  | 'clock'
  | 'close'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'plus'
  | 'minus'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  | 'target'
  | 'compass'
  | 'sunrise'
  | 'sunset'
  | 'info'
  | 'menu'
  | 'news'
  | 'arrowUpRight'
  | 'check'
  | 'user'
  | 'lock'
  | 'cloud'
  | 'satellite';

const PATHS: Record<IconName, string> = {
  map: 'M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6ZM3.6 9.4h16.8M3.6 14.6h16.8M12 3.2c-2.4 2.4-3.6 5.3-3.6 8.8s1.2 6.4 3.6 8.8M12 3.2c2.4 2.4 3.6 5.3 3.6 8.8s-1.2 6.4-3.6 8.8',
  planet: 'M12.6 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2ZM4.7 16.4c-1.9.9-3 1.9-2.8 2.7.3 1.5 4.9 1.6 10.3.3 5.4-1.3 9.5-3.6 9.2-5.1-.1-.8-1.4-1.2-3.4-1.3',
  star: 'M12 3.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.6l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7L12 3.6Z',
  constellation: 'M5.4 6.2 10 12.4l6.2-2.4 2.4 7.8M5.4 6.2 16.2 10M10 12.4l8.6 5.4M5.4 4.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM16.2 8.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM10 10.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM18.6 16.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z',
  moon: 'M20 14.3A8.4 8.4 0 0 1 9.7 4 8.4 8.4 0 1 0 20 14.3Z',
  sparkle: 'M12 3.4v4.2M12 16.4v4.2M4.6 12h4.2M15.2 12h4.2M6.8 6.8l2.9 2.9M14.3 14.3l2.9 2.9M17.2 6.8l-2.9 2.9M9.7 14.3l-2.9 2.9',
  calendar: 'M4.6 7.6a2 2 0 0 1 2-2h10.8a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2V7.6ZM8.4 3.6v4M15.6 3.6v4M4.6 10.6h14.8',
  search: 'M10.9 3.9a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15.9 15.9l4.3 4.3',
  eye: 'M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
  layers: 'M12 3.4 2.9 8.2 12 13l9.1-4.8L12 3.4ZM2.9 15.8 12 20.6l9.1-4.8M2.9 12 12 16.8l9.1-4.8',
  location: 'M12 21.2s6.6-5.4 6.6-10.4a6.6 6.6 0 1 0-13.2 0c0 5 6.6 10.4 6.6 10.4ZM12 8.3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  clock: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2ZM12 7.2V12l3.2 2.2',
  close: 'M5.8 5.8 18.2 18.2M18.2 5.8 5.8 18.2',
  chevronLeft: 'M14.6 5.8 8.4 12l6.2 6.2',
  chevronRight: 'M9.4 5.8 15.6 12l-6.2 6.2',
  chevronDown: 'M5.8 9.4 12 15.6l6.2-6.2',
  plus: 'M12 5.4v13.2M5.4 12h13.2',
  minus: 'M5.4 12h13.2',
  play: 'M8.2 5.4 18.4 12 8.2 18.6V5.4Z',
  pause: 'M9 5.6v12.8M15 5.6v12.8',
  rewind: 'M11.4 6.2 4.6 12l6.8 5.8V6.2ZM19.4 6.2 12.6 12l6.8 5.8V6.2Z',
  forward: 'M12.6 6.2 19.4 12l-6.8 5.8V6.2ZM4.6 6.2 11.4 12l-6.8 5.8V6.2Z',
  target: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22',
  compass: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2ZM15.4 8.6l-2 5.4-5.4 2 2-5.4 5.4-2Z',
  sunrise: 'M12 4.2v3.4M5.6 10 4.2 8.6M18.4 10l1.4-1.4M2.8 17.4h18.4M7.6 17.4a4.4 4.4 0 0 1 8.8 0M6.4 20.6h11.2',
  sunset: 'M12 7.6V4.2M5.6 10 4.2 8.6M18.4 10l1.4-1.4M2.8 17.4h18.4M7.6 17.4a4.4 4.4 0 0 1 8.8 0M9.4 5.4 12 8l2.6-2.6',
  info: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2ZM12 11v5.4M12 7.8h.01',
  menu: 'M4.4 7.2h15.2M4.4 12h15.2M4.4 16.8h15.2',
  news: 'M4.4 6.4a1.8 1.8 0 0 1 1.8-1.8h9.6a1.8 1.8 0 0 1 1.8 1.8v11a2.2 2.2 0 0 0 2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V6.4ZM17.6 9.6h1.2a.8.8 0 0 1 .8.8v7.2M7.6 8.4h6.4M7.6 12h6.4M7.6 15.6h3.6',
  arrowUpRight: 'M7.6 16.4 16.4 7.6M9.2 7.6h7.2v7.2',
  check: 'M5.4 12.6l4.4 4.4 8.8-9.6',
  user: 'M12 3.8a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8ZM4.8 20.2a7.2 7.2 0 0 1 14.4 0',
  cloud: 'M7.4 19a4.4 4.4 0 0 1-.5-8.77 5.6 5.6 0 0 1 10.8 1.17A3.8 3.8 0 0 1 17.1 19H7.4Z',
  satellite: 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM9.6 9.6 5.4 5.4M14.4 9.6l4.2-4.2M9.6 14.4l-4.2 4.2M14.4 14.4l4.2 4.2M3.4 5.4a2 2 0 0 1 2-2M18.6 3.4a2 2 0 0 1 2 2M5.4 20.6a2 2 0 0 1-2-2M20.6 18.6a2 2 0 0 1-2 2',
  lock: 'M6.4 10.6h11.2a1.6 1.6 0 0 1 1.6 1.6v6.4a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6v-6.4a1.6 1.6 0 0 1 1.6-1.6ZM8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8',
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, className, strokeWidth = 1.5 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
