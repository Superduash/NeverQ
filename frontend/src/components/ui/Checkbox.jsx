import React from 'react';

export function Checkbox({
  label,
  description,
  checked = false,
  onChange,
  disabled = false,
  id,
  className = '',
}) {
  const checkboxId = id || (label ? `check-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <label
      htmlFor={checkboxId}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)] h-4 w-4"
      />
      <div className="flex flex-col">
        {label && <span className="text-xs font-semibold text-[var(--ink)]">{label}</span>}
        {description && <span className="text-[11px] text-[var(--ink-faint)]">{description}</span>}
      </div>
    </label>
  );
}
