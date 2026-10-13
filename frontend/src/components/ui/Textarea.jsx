import React from 'react';

export function Textarea({
  label,
  value,
  onChange,
  error,
  helper,
  id,
  rows = 3,
  maxLength,
  disabled = false,
  required = false,
  className = '',
  ...props
}) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-[var(--ink)]">
            {label} {required && <span className="text-[var(--danger)]">*</span>}
          </label>
        )}
        {maxLength && (
          <span className="text-[10px] text-[var(--ink-faint)] tnum">
            {value?.length || 0}/{maxLength}
          </span>
        )}
      </div>

      <textarea
        id={textareaId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={`
          w-full rounded-xl bg-[var(--surface)] border text-xs font-medium text-[var(--ink)]
          focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 outline-none
          transition-all p-3 placeholder:text-[var(--ink-faint)] resize-none
          ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        {...props}
      />

      {error ? (
        <span className="text-[11px] font-medium text-[var(--danger)]">{error}</span>
      ) : helper ? (
        <span className="text-[11px] text-[var(--ink-faint)]">{helper}</span>
      ) : null}
    </div>
  );
}
