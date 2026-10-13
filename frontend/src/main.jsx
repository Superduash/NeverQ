import React, { createContext, useContext, useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { io } from 'socket.io-client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sun, Moon, Laptop, ArrowLeft, AlertCircle } from 'lucide-react';
import { mockApi, storage } from './lib/mock.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

// ───────────── Theme Context & Provider (Light & Dark Only) ─────────────
export const ThemeContext = createContext({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = storage.getTheme();
    return saved === 'dark' ? 'dark' : 'light';
  });

  const applyTheme = useCallback((targetTheme) => {
    const active = targetTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', active);
    document.documentElement.style.colorScheme = active;

    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => {
      meta.setAttribute('content', active === 'dark' ? '#00111c' : '#0077b6');
      meta.removeAttribute('media');
    });
  }, []);

  const setTheme = (nextTheme) => {
    const val = nextTheme === 'dark' ? 'dark' : 'light';
    setThemeState(val);
    storage.setTheme(val);
    applyTheme(val);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

// ───────────── Theme Toggle Component (Light / Dark only) ─────────────
export function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`touch-target p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--brand)] transition-colors ${className}`}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <Sun size={18} className="text-[var(--accent-2)]" />
      ) : (
        <Moon size={18} className="text-[var(--brand)]" />
      )}
    </button>
  );
}

// ───────────── Logo Placeholder ─────────────
/* LOGO PLACEHOLDER — replace /public/logo.svg. Brand colours: light #0077b6→#00b4d8 gradient on #f4fbff; dark #22d3ee on #00111c. Square, works at 24px, transparent background. */
export function Logo({ size = 28, showText = true, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {!imgFailed ? (
        <img
          src="/logo.svg"
          alt="NeverQ"
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          className="rounded-lg object-contain"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="rounded-lg border-2 border-dashed border-[var(--brand)] flex items-center justify-center font-bold text-xs text-[var(--brand)] bg-[var(--surface-2)]"
        >
          NQ
        </div>
      )}
      {showText && (
        <span className="font-heading font-extrabold text-lg tracking-tight bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] bg-clip-text text-transparent">
          NeverQ
        </span>
      )}
    </div>
  );
}

// ───────────── API Client Facade ─────────────
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = {
  async listOrgs(params) {
    if (USE_MOCK) return mockApi.listOrgs(params);
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/orgs${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw { status: res.status, message: 'Failed to fetch hospitals' };
    return res.json();
  },

  async getOrg(id) {
    if (USE_MOCK) return mockApi.getOrg(id);
    const res = await fetch(`${API_URL}/orgs/${id}`);
    if (!res.ok) throw { status: res.status, message: 'Hospital not found' };
    return res.json();
  },
};

// ───────────── Socket Client Singleton & Hooks ─────────────
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export function useSocketRoom(room, event, handler) {
  useEffect(() => {
    if (!room || !event || !handler) return;
    socket.connect();
    socket.emit('join', { room });
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
      socket.emit('leave', { room });
    };
  }, [room, event, handler]);
}

// 10-second polling safety-net hook that merges/replaces state from payloads
export function useLiveData(fetcher, { room, event, interval = 10000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetcher();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    load();
    const timer = setInterval(load, interval);
    return () => clearInterval(timer);
  }, [load, interval]);

  // If mock mode, hook into mock subscribe
  useEffect(() => {
    if (USE_MOCK && mockApi.subscribe) {
      const unsubscribe = mockApi.subscribe(() => {
        load();
      });
      return unsubscribe;
    }
  }, [load]);

  // Socket listener when configured
  useSocketRoom(room, event, (payload) => {
    if (payload) setData(payload);
  });

  return { data, loading, error, refresh: load };
}

// ───────────── Route Stubs & Error Boundary ─────────────
function RouteStub({ name, description }) {
  const navigate = useNavigate();
  const params = useParams();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)]">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--brand)] mb-3">
          Part 2 / 3 Route Stub
        </span>
        <h2 className="text-xl font-bold mb-2 text-[var(--ink)]">{name}</h2>
        <p className="text-sm text-[var(--ink-faint)] mb-6">
          {description || `Route placeholder for ${window.location.pathname}`}
        </p>
        {Object.keys(params).length > 0 && (
          <div className="text-xs bg-[var(--surface-2)] p-3 rounded-xl mb-6 text-left tnum overflow-x-auto">
            {JSON.stringify(params, null, 2)}
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="touch-target px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white font-medium text-sm inline-flex items-center gap-2 shadow-[var(--shadow-glow)] hover:opacity-95"
        >
          <ArrowLeft size={16} /> Back to Live Map
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] max-w-sm w-full">
        <h1 className="text-4xl font-extrabold text-[var(--brand)] mb-2">404</h1>
        <p className="text-sm text-[var(--ink-faint)] mb-6">Page not found.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="touch-target px-5 py-2.5 rounded-xl bg-[var(--brand)] text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Return to NeverQ
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('NeverQ boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)] text-[var(--ink)]">
          <div className="p-6 max-w-md w-full rounded-2xl bg-[var(--surface)] border border-[var(--danger)] text-center">
            <AlertCircle className="mx-auto text-[var(--danger)] mb-3" size={36} />
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="text-xs text-[var(--ink-faint)] mb-4">
              {this.state.error?.message || 'An unexpected error occurred in the application.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="touch-target px-4 py-2 rounded-xl bg-[var(--brand)] text-white text-sm font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ───────────── AppShell Layout with Transitions ─────────────
const LandingLazy = lazy(() => import('./pages/Landing.jsx'));

function AppShell() {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col overflow-x-clip bg-[var(--bg)] text-[var(--ink)]">
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex-1 flex flex-col"
        >
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="shimmer-box w-full max-w-xl h-64 rounded-3xl" />
              </div>
            }
          >
            <Routes location={location}>
              <Route path="/" element={<LandingLazy />} />
              <Route path="/hospital/:orgId" element={<RouteStub name="Hospital View" />} />
              <Route path="/join/:orgId/:deptId" element={<RouteStub name="Join Queue" />} />
              <Route path="/t/:token" element={<RouteStub name="Live Ticket Status" />} />
              <Route path="/staff/login" element={<RouteStub name="Staff Login" />} />
              <Route path="/staff" element={<RouteStub name="Staff Dashboard" />} />
              <Route path="/admin/login" element={<RouteStub name="Admin Login" />} />
              <Route path="/admin" element={<RouteStub name="Admin Dashboard" />} />
              <Route path="/admin/orgs/:id" element={<RouteStub name="Admin Org Details" />} />
              <Route path="/board/:orgId" element={<RouteStub name="Public Wait Board" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

// ───────────── Root Bootstrap ─────────────
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <BrowserRouter>
            <AppShell />
            <Toaster
              position="bottom-right"
              richColors
              closeButton
              toastOptions={{
                className: '!bg-[var(--surface)] !text-[var(--ink)] !border-[var(--border)]',
              }}
            />
          </BrowserRouter>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
