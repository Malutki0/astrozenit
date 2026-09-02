/*
 * Prymitywy interfejsu.
 *
 * Każdy element ma komplet stanów: spoczynek, najechanie, fokus klawiaturą,
 * naciśnięcie i wyłączenie. Nic tu nie jest ozdobne, wszystko służy czytelności
 * gęstego zestawu danych na ciemnym tle.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import styles from './ui.module.css';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ przycisk */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  fullWidth?: boolean;
  loading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  quiet: styles.quiet,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  fullWidth,
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        styles.button,
        VARIANT_CLASS[variant],
        variant !== 'quiet' && SIZE_CLASS[size],
        fullWidth && styles.fullWidth,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={size === 'sm' ? 15 : 17} />}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
  bordered?: boolean;
  size?: number;
}

export function IconButton({
  icon,
  label,
  active,
  bordered,
  size = 18,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        styles.iconButton,
        active && styles.iconButtonActive,
        bordered && styles.iconButtonBordered,
        className,
      )}
      aria-label={label}
      title={label}
      aria-pressed={active !== undefined ? active : undefined}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/* ------------------------------------------------------------ etykieta stanu */

export type ChipTone = 'neutral' | 'accent' | 'visible' | 'warn' | 'down';

const CHIP_CLASS: Record<ChipTone, string> = {
  neutral: styles.chipNeutral,
  accent: styles.chipAccent,
  visible: styles.chipVisible,
  warn: styles.chipWarn,
  down: styles.chipDown,
};

export function Chip({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: ChipTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.chip, CHIP_CLASS[tone])}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------- pole */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /* Etykieta bywa niepotrzebna wizualnie, ale zawsze musi istnieć dla czytnika ekranu. */
  hideLabel?: boolean;
}

export function Field({ label, hint, error, hideLabel, id, className, ...rest }: FieldProps) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label className={hideLabel ? 'sr-only' : styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className={styles.input}
        aria-describedby={cx(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- przełącznik */

export function Toggle({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleLabel}>
        {icon && <Icon name={icon} size={16} />}
        {label}
      </span>
      <span className={cx(styles.track, checked && styles.trackOn)} aria-hidden="true">
        <span className={cx(styles.knob, checked && styles.knobOn)} />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------- suwak */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const id = `slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={styles.field}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <span className={styles.statValue} style={{ fontSize: 'var(--text-xs)' }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className={styles.slider}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- segmenty */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx(styles.segment, option.value === value && styles.segmentActive)}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------ stany ładowania i pustki */

export function Skeleton({ width, height = 14 }: { width?: number | string; height?: number }) {
  return (
    <span
      className={styles.skeleton}
      style={{ display: 'block', width: width ?? '100%', height }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{children}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ wartość liczbowa */

export function Stat({
  label,
  value,
  large,
  title,
}: {
  label: string;
  value: ReactNode;
  large?: boolean;
  title?: string;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={cx(styles.statValue, large && styles.statValueLarge)} title={title}>
        {value}
      </span>
    </div>
  );
}

export { PhotoFrame, PhotoThumb } from './Photo';
export { Icon };
export type { IconName };
