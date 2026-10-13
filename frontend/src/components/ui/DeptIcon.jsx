import React from 'react';
import { deptIcon, deptTint } from '../../lib/constants.js';

/** Rounded colored tile with a lucide department icon. */
export function DeptIcon({ name, size = 40, className = '' }) {
  const Icon = deptIcon(name);
  const tint = deptTint(name);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: tint.bg, color: tint.fg }}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className}`}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
