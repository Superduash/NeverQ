import React from 'react';

export function Tabs({ tabs = [], activeTab, onChange, className = '' }) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 p-1 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] ${className}`}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`
              touch-target flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
              ${active
                ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs font-bold'
                : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}
            `}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--surface-2)] text-[var(--ink-faint)]">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
