import React, { useState } from 'react';

/* Brand logo. Uses /logo.svg; falls back to a gradient monogram if it fails to load.
   Brand colours: light #0077b6→#00b4d8, dark #22d3ee on #00111c. */
export function LogoMark({ size = 28, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/logo.svg"
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-lg object-contain ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] font-heading font-extrabold text-white ${className}`}
    >
      NQ
    </span>
  );
}

export function Logo({ size = 28, showText = true, className = '' }) {
  return (
    <span className={`inline-flex select-none items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="font-heading text-lg font-extrabold tracking-tight bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] bg-clip-text text-transparent">
          NeverQ
        </span>
      )}
    </span>
  );
}

export default Logo;
