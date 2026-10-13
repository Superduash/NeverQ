import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helper,
    iconLeft,
    iconRight,
    onClear,
    value,
    className = '',
    id,
    type = 'text',
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-[var(--ink)]">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {iconLeft && (
          <span className="absolute left-3 text-[var(--ink-faint)] pointer-events-none">
            {iconLeft}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          value={value}
          className={`
            w-full rounded-xl bg-[var(--surface)] border text-xs font-medium text-[var(--ink)]
            focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 outline-none
            transition-all placeholder:text-[var(--ink-faint)]
            ${iconLeft ? 'pl-9' : 'pl-3.5'}
            ${iconRight || (onClear && value) ? 'pr-9' : 'pr-3.5'}
            py-2.5 h-10
            ${error ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]/20' : 'border-[var(--border)]'}
            ${className}
          `}
          {...props}
        />

        {onClear && value ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2.5 p-1 text-[var(--ink-faint)] hover:text-[var(--ink)] rounded"
            aria-label="Clear input"
          >
            ×
          </button>
        ) : (
          iconRight && (
            <span className="absolute right-3 text-[var(--ink-faint)] pointer-events-none">
              {iconRight}
            </span>
          )
        )}
      </div>

      {error ? (
        <span className="text-[11px] font-medium text-[var(--danger)]">{error}</span>
      ) : helper ? (
        <span className="text-[11px] text-[var(--ink-faint)]">{helper}</span>
      ) : null}
    </div>
  );
});
