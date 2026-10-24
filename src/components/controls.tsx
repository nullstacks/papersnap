/**
 * Sidebar option controls.
 *
 * Every tool panel composes these, so the visual language (22px radio circles,
 * 24px checkbox squares, 8px-radius tiles, blue info callouts) is defined once
 * and stays identical across all 23 tools.
 */
import type { ReactNode } from 'react';
import { CheckGlyph } from './Icons';

/* ------------------------------------------------------------------ layout */

/** A field label. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="option-title">{children}</div>;
}

/** A vertical block of controls with the reference's spacing. */
export function Section({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-3 pb-1">{children}</div>;
}

/** A pale blue information callout. */
export function Info({ children }: { children: ReactNode }) {
  return <div className="info-box">{children}</div>;
}

/** Two fields side by side. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex gap-2">{children}</div>;
}

/** Wraps a field so it shares the row width evenly. */
export function Field({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>;
}

/* ------------------------------------------------------------------ inputs */

const inputClass =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink ' +
  'focus:border-ink focus:outline-none';

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
  step,
  id,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'password';
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}) {
  return (
    <div className="mb-3">
      {label && (
        <label className="option-title block" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  id?: string;
}) {
  return (
    <div className="mb-3">
      {label && (
        <label className="option-title block" htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className={`select-field cursor-pointer ${inputClass}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  id,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="mb-3">
      {label && (
        <label className="option-title block" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded border border-muted bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-ink focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Colour swatch; sits flush at the end of a row. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="option-title mb-0">{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
      />
    </div>
  );
}

/** Password field with the reference's reveal button. */
export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  id,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="mb-3">
      {label && (
        <label className="option-title block" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        type="password"
        className={inputClass}
        value={value}
        placeholder={placeholder}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* --------------------------------------------------------------- selection */

/** A row of radio cards with a title and a description each. */
export function RadioCards({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; title: string; body?: string }>;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={`relative flex cursor-pointer flex-wrap items-start gap-x-3 rounded-lg border bg-surface p-3.5 ${
              checked ? 'border-muted' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border bg-surface ${
                checked ? 'border-[6px] border-ink-2' : 'border-muted'
              }`}
            />
            <span className="text-[15px] leading-[22px] font-medium text-ink-2">{o.title}</span>
            {o.body && (
              <span className="mt-0.5 basis-full pl-[34px] text-sm leading-[18px] text-muted">
                {o.body}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Plain inline radio row, for short mutually-exclusive choices. */
export function RadioRow({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-3 text-[15px] text-ink-2"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`h-[22px] w-[22px] shrink-0 rounded-full border bg-surface ${
                checked ? 'border-[6px] border-success' : 'border-muted'
              }`}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Checkbox row with the reference's 24px rounded square. */
export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="mb-3">
      <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[22px] text-ink-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={`mt-0 flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-surface ${
            checked ? 'border-success' : 'border-muted'
          }`}
        >
          {checked && <CheckGlyph className="text-success-dark" />}
        </span>
        <span>{label}</span>
      </label>
    </div>
  );
}

/** Icon tile strip (mode pickers). */
export function TileRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: string }>;
}) {
  return (
    <div className="mb-3 flex gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg border-2 px-2 py-2.5 text-[13px] ${
              active
                ? 'border-brand bg-canvas font-medium text-brand'
                : 'border-transparent bg-canvas text-faint hover:bg-subtle hover:text-ink-2'
            }`}
          >
            {o.icon && <img src={o.icon} alt="" aria-hidden="true" className="h-6 w-6" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Row of square action buttons (rotate left/right, add/remove a range). */
export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex gap-2">{children}</div>;
}

export function ActionButton({
  onClick,
  children,
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-2 py-2.5 text-[13px] font-medium text-ink-2 hover:border-ink-2 hover:bg-canvas"
    >
      {icon && <img src={icon} alt="" aria-hidden="true" className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** A small muted footnote under the controls. */
export function Note({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mt-2 rounded-md bg-canvas px-2 py-1.5 text-xs leading-snug text-muted">
      {children}
    </div>
  );
}

/**
 * 3x3 page-position picker, as the reference uses for page numbers.
 * Emits "<vertical>-<horizontal>", e.g. "bottom-right".
 */
export function PagePositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rows = ['top', 'middle', 'bottom'] as const;
  const cols = ['left', 'center', 'right'] as const;
  return (
    <div
      className="grid h-[72px] w-[72px] grid-rows-3 rounded border border-line bg-surface p-1"
      role="radiogroup"
      aria-label="Position"
    >
      {rows.map((v) => (
        <div key={v} className="relative flex items-center justify-between">
          <span aria-hidden="true" className="absolute inset-x-2.5 top-1/2 border-t border-dashed border-line" />
          {cols.map((h) => {
            const key = `${v}-${h}`;
            const active = value === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${v} ${h}`}
                onClick={() => onChange(key)}
                className={`relative z-10 h-3 w-3 rounded-full border ${
                  active ? 'border-brand bg-brand' : 'border-transparent bg-line hover:bg-muted'
                }`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}