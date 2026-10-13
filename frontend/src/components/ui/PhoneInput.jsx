import React, { forwardRef } from 'react';

export const PhoneInput = forwardRef(function PhoneInput(
  {
    label = 'Phone Number',
    value = '',
    onChange,
    error,
    helper = 'For queue updates and SMS notices',
    id,
    disabled = false,
    required = false,
    ...props
  },
  ref
) {
  const inputId = id || 'phone-input';

  // Handle typing: normalize to 10 numeric digits
  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const trimmed = raw.slice(0, 10);
    if (onChange) {
      onChange(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-[var(--ink)]">
          {label} {required && <span className="text-[var(--danger)]">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <span className="absolute left-3 text-xs font-bold text-[var(--ink-faint)] select-none tnum">
          +91
        </span>
        <input
          ref={ref}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={disabled}
          value={value}
          onChange={handleChange}
          placeholder="98765 43210"
          className={`
            w-full rounded-xl bg-[var(--surface)] border text-xs font-medium text-[var(--ink)] tnum
            focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 outline-none
            transition-all placeholder:text-[var(--ink-faint)]
            pl-12 pr-3.5 py-2.5 h-10 tracking-wider
            ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          {...props}
        />
      </div>

      {error ? (
        <span className="text-[11px] font-medium text-[var(--danger)]">{error}</span>
      ) : helper ? (
        <span className="text-[11px] text-[var(--ink-faint)]">{helper}</span>
      ) : null}
    </div>
  );
});
