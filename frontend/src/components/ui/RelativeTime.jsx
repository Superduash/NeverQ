import React, { useState, useEffect } from 'react';

export function RelativeTime({ timestamp = Date.now(), className = '' }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 15000); // ticks every 15s
    return () => clearInterval(timer);
  }, []);

  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  let text = 'Updated just now';
  if (diffSec >= 60 && diffSec < 120) {
    text = 'Updated 1 min ago';
  } else if (diffSec >= 120 && diffSec < 3600) {
    text = `Updated ${Math.floor(diffSec / 60)} min ago`;
  } else if (diffSec >= 3600) {
    text = `Updated ${Math.floor(diffSec / 3600)}h ago`;
  }

  return (
    <span className={`text-[11px] text-[var(--ink-faint)] tnum ${className}`}>
      {text}
    </span>
  );
}
