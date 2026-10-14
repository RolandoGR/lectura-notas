import type { ComponentChildren } from 'preact';
import { BackIcon } from './icons';

interface SegmentedProps<T> {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={option.value === value}
          class={`segment${option.value === value ? ' segment-on' : ''}`}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label class="toggle">
      <span class="toggle-text">
        <span>{label}</span>
        {hint && <span class="hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <section class="field">
      <h2 class="field-label">{label}</h2>
      {children}
    </section>
  );
}

export function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ComponentChildren }) {
  return (
    <div class="page">
      <header class="page-header">
        <button type="button" class="icon-button" onClick={onBack} aria-label="Volver">
          <BackIcon />
        </button>
        <h1>{title}</h1>
      </header>
      <div class="page-body">{children}</div>
    </div>
  );
}
