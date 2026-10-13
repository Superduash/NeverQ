import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { storage } from './mock.js';

export const ThemeContext = createContext({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
});

function applyTheme(targetTheme) {
  const active = targetTheme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.setAttribute('data-theme', active);
  root.style.colorScheme = active;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', active === 'dark' ? '#00111c' : '#0077b6');
    meta.removeAttribute('media');
  });
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storage.getTheme());

  const setTheme = useCallback((next) => {
    const val = next === 'dark' ? 'dark' : 'light';
    applyTheme(val);
    storage.setTheme(val);
    setThemeState(val);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolvedTheme: theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`touch-target p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--brand)] transition-colors ${className}`}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <Sun size={17} className="text-[var(--accent-2)]" />
      ) : (
        <Moon size={17} className="text-[var(--brand)]" />
      )}
    </button>
  );
}
