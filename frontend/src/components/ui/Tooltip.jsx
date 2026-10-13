import React, { useState } from 'react';

export function Tooltip({ children, content, position = 'top' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className="absolute z-50 px-2.5 py-1 text-[11px] font-semibold text-white bg-[var(--ink)] rounded-lg shadow-lg whitespace-nowrap pointer-events-none -top-8 left-1/2 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-100"
        >
          {content}
        </div>
      )}
    </div>
  );
}
