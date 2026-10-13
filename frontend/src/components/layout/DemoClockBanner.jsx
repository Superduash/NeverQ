import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { mockEngine } from '../../lib/mock/engine.js';

export function DemoClockBanner() {
  const [offsetMinutes, setOffsetMinutes] = useState(() => {
    return Math.round((mockEngine.db?.settings?.clockOffsetMs || 0) / (60 * 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Math.round((mockEngine.db?.settings?.clockOffsetMs || 0) / (60 * 1000));
      setOffsetMinutes(current);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  if (offsetMinutes === 0) return null;

  return (
    <div
      role="status"
      className="shrink-0 bg-[var(--accent-2)] text-black px-4 py-1.5 flex items-center justify-between text-xs font-bold z-50 select-none shadow-xs"
    >
      <div className="flex items-center gap-2">
        <Clock size={14} className="shrink-0 animate-spin" />
        <span>Demo clock fast-forwarded +{offsetMinutes} min</span>
      </div>
      <button
        type="button"
        onClick={() => {
          mockEngine.db.settings.clockOffsetMs = 0;
          mockEngine.save();
          setOffsetMinutes(0);
        }}
        className="px-2 py-0.5 rounded bg-black/15 hover:bg-black/25 text-black font-semibold text-[10px]"
      >
        Reset Clock
      </button>
    </div>
  );
}
