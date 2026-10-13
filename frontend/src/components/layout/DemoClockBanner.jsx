import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// F-07: DemoClockBanner is only meaningful in mock mode.
// In real mode it would read a stale in-memory mockEngine, so we guard it.
export function DemoClockBanner() {
  const [offsetMinutes, setOffsetMinutes] = useState(0);

  useEffect(() => {
    if (!USE_MOCK) return; // F-07: skip entirely in real mode

    // Lazy import mockEngine only in mock mode to avoid bundling it in prod
    import('../../lib/mock/engine.js').then(({ mockEngine }) => {
      const read = () =>
        Math.round((mockEngine.db?.settings?.clockOffsetMs || 0) / 60000);

      setOffsetMinutes(read());

      const timer = setInterval(() => setOffsetMinutes(read()), 2000);
      return () => clearInterval(timer);
    });
  }, []);

  if (!USE_MOCK || offsetMinutes === 0) return null;

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
        onClick={async () => {
          const { mockEngine } = await import('../../lib/mock/engine.js');
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
