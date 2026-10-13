import React from 'react';

export function Select({
  label,
  options = [],
  value,
  onChange,
  error,
  helper,
  id,
  className = '',
  disabled = false,
  required = false,
  ...props
}) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-[var(--ink)]">
          {label} {required && <span className="text-[var(--danger)]">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className={`
            w-full rounded-xl bg-[var(--surface)] border text-xs font-medium text-[var(--ink)]
            focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 outline-none
            transition-all px-3.5 py-2.5 h-10 appearance-none
            ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-3.5 top-3.5 text-[var(--ink-faint)] pointer-events-none text-xs">
          ▼
        </span>
      </div>

      {error ? (
        <span className="text-[11px] font-medium text-[var(--danger)]">{error}</span>
      ) : helper ? (
        <span className="text-[11px] text-[var(--ink-faint)]">{helper}</span>
      ) : null}
    </div>
  );
}
