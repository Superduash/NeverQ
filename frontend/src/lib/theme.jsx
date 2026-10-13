import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { storage } from './storage.js';

export const ThemeContext = createContext({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
});

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const resolve = (theme) => (theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme);

function applyTheme(resolved) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', resolved === 'dark' ? '#00111c' : '#0077b6');
    meta.removeAttribute('media');
  });
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storage.getTheme());
  const [resolvedTheme, setResolved] = useState(() => resolve(storage.getTheme()));

  const setTheme = useCallback((next) => {
    const val = next === 'dark' || next === 'system' ? next : 'light';
    storage.setTheme(val);
    setThemeState(val);
  }, []);

  useEffect(() => {
    const next = resolve(theme);
    setResolved(next);
    applyTheme(next);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r = mq.matches ? 'dark' : 'light';
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle({ className = '' }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] transition hover:border-[var(--brand)] active:scale-95 ${className}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={18} className="text-[var(--accent-2)]" /> : <Moon size={18} className="text-[var(--brand)]" />}
    </button>
  );
}
