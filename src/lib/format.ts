/* Formatowanie liczb, dat i jednostek w konwencji polskiej. */

const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
const timeSecFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });
const dateFullFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long' });
const monthYearFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
const inputDateFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatTime = (d: Date | null | undefined): string => (d ? timeFmt.format(d) : 'brak');
export const formatTimeSec = (d: Date): string => timeSecFmt.format(d);
export const formatDate = (d: Date): string => dateFmt.format(d);
export const formatDateFull = (d: Date): string => dateFullFmt.format(d);
export const formatWeekday = (d: Date): string => weekdayFmt.format(d);
export const formatMonthYear = (d: Date): string => monthYearFmt.format(d);

/** Data w formacie akceptowanym przez pole typu date, w czasie lokalnym. */
export const toDateInput = (d: Date): string => inputDateFmt.format(d);
export const toTimeInput = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const numFmt = (min: number, max: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: min, maximumFractionDigits: max });

const n0 = numFmt(0, 0);
const n1 = numFmt(1, 1);
const n2 = numFmt(2, 2);
const n3 = numFmt(3, 3);

export const formatNumber = (v: number, digits = 0): string =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

/** Stopnie z symbolem, na przykład 42,3°. */
export const formatDegrees = (v: number, digits = 1): string => `${formatNumber(v, digits)} °`;

/** Azymut z kierunkiem świata, na przykład 137,4° (SE). */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassPoint = (azimuth: number): string =>
  COMPASS[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16];
export const formatAzimuth = (v: number): string => `${formatNumber(v, 1)} ° ${compassPoint(v)}`;

/** Rektascensja w zapisie godzinowym, na przykład 18h 36m 56s. */
export function formatRa(hours: number): string {
  const h = Math.floor(hours);
  const mFloat = (hours - h) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const carry = s === 60;
  return `${h}h ${String(carry ? m + 1 : m).padStart(2, '0')}m ${String(carry ? 0 : s).padStart(2, '0')}s`;
}

/** Deklinacja w stopniach, minutach i sekundach łuku. */
export function formatDec(deg: number): string {
  const sign = deg < 0 ? '-' : '+';
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  return `${sign}${d}° ${String(m).padStart(2, '0')}' ${String(s).padStart(2, '0')}"`;
}

/** Wielkość gwiazdowa ze znakiem, zawsze z dwoma miejscami. */
export const formatMagnitude = (v: number): string => `${v > 0 ? '+' : ''}${n2.format(v)}`;

/** Odległość w latach świetlnych, ze skalowaniem do tysięcy i milionów. */
export function formatLightYears(ly: number): string {
  if (ly >= 1_000_000) return `${n1.format(ly / 1_000_000)} mln lat świetlnych`;
  if (ly >= 10_000) return `${n0.format(ly / 1000)} tys. lat świetlnych`;
  if (ly >= 100) return `${n0.format(ly)} lat świetlnych`;
  return `${n1.format(ly)} lat świetlnych`;
}

/** Odległość w kilometrach, ze skalowaniem do milionów i miliardów. */
export function formatKm(km: number): string {
  if (km >= 1e9) return `${n2.format(km / 1e9)} mld km`;
  if (km >= 1e6) return `${n1.format(km / 1e6)} mln km`;
  return `${n0.format(km)} km`;
}

export const formatAu = (au: number): string => `${n3.format(au)} au`;

/** Rozmiar kątowy dobrany do skali: sekundy, minuty albo stopnie łuku. */
export function formatAngularSize(arcsec: number): string {
  if (arcsec >= 3600) return `${n1.format(arcsec / 3600)} °`;
  if (arcsec >= 60) return `${n1.format(arcsec / 60)}'`;
  return `${n1.format(arcsec)}"`;
}

/** Czas trwania podany w minutach, zamieniony na godziny i minuty. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export const formatPercent = (fraction: number, digits = 0): string =>
  `${formatNumber(fraction * 100, digits)} %`;

/** Polska odmiana rzeczownika po liczbie, na przykład 1 doba, 2 doby, 5 dób. */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.round(count));
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

export const formatDays = (days: number): string =>
  `${n1.format(days)} ${plural(days, 'doba', 'doby', 'doby')}`;

/** Odstęp względem teraz, na przykład "za 3 dni" albo "wczoraj". */
export function relativeDays(target: Date, now = new Date()): string {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'dzisiaj';
  if (diff === 1) return 'jutro';
  if (diff === -1) return 'wczoraj';
  if (diff === 2) return 'pojutrze';
  if (diff > 0) return `za ${diff} ${plural(diff, 'dzień', 'dni', 'dni')}`;
  return `${Math.abs(diff)} ${plural(diff, 'dzień', 'dni', 'dni')} temu`;
}
