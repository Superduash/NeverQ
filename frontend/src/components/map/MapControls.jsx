import React from 'react';
import { LocateFixed, Plus, Minus, Compass } from 'lucide-react';

export function MapControls({
  onRecenter,
  onZoomIn,
  onZoomOut,
  onResetNorth,
  className = '',
}) {
  return (
    <div className={`absolute top-4 right-4 z-20 flex flex-col gap-2 ${className}`}>
      {/* Zoom in / out cluster */}
      <div className="flex flex-col rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden">
        <button
          type="button"
          onClick={onZoomIn}
          className="p-2.5 text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)] flex items-center justify-center"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="p-2.5 text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={16} />
        </button>
      </div>

      {/* Recenter to User Location / Results */}
      {onRecenter && (
        <button
          type="button"
          onClick={onRecenter}
          className="p-2.5 rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-card)] text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center"
          aria-label="Recenter map"
          title="Recenter to your location"
        >
          <LocateFixed size={16} />
        </button>
      )}

      {/* Reset Compass / North */}
      {onResetNorth && (
        <button
          type="button"
          onClick={onResetNorth}
          className="p-2.5 rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-card)] text-[var(--ink-muted)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center"
          aria-label="Reset orientation to North"
          title="Reset orientation"
        >
          <Compass size={16} />
        </button>
      )}
    </div>
  );
}
