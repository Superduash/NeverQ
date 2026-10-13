import React, { createContext, useContext, useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sun, Moon, ArrowLeft } from 'lucide-react';
import { storage } from './lib/mock.js';
import { api } from './lib/api.js';
import { useLiveData, useSocketRoom, socketManager } from './lib/socket.js';
import { CustomerLayout } from './components/layout/CustomerLayout.jsx';
import { StaffLayout } from './components/layout/StaffLayout.jsx';
import { AdminLayout } from './components/layout/AdminLayout.jsx';
import { RequireStaff, RequireAdmin } from './components/layout/Guards.jsx';
import { NotFound } from './components/layout/NotFound.jsx';
import { ErrorBoundary } from './components/layout/ErrorBoundary.jsx';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

// Re-export api and live hooks for backward and module compatibility
export { api, useLiveData, useSocketRoom };

// Theme lives in lib/theme.jsx (avoids circular import with lazy pages)
import { ThemeProvider, ThemeToggle, useTheme, ThemeContext } from './lib/theme.jsx';
export { ThemeProvider, ThemeToggle, useTheme, ThemeContext };

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

// ───────────── Route Stubs ─────────────
function RouteStub({ name, description }) {
  const navigate = useNavigate();
  const params = useParams();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)]">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--brand)] mb-3">
          NeverQ Route
        </span>
        <h2 className="text-xl font-bold mb-2 text-[var(--ink)]">{name}</h2>
        <p className="text-xs text-[var(--ink-faint)] mb-6">
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
          className="touch-target px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white font-medium text-xs inline-flex items-center gap-2 shadow-[var(--shadow-glow)] hover:opacity-95"
        >
          <ArrowLeft size={15} /> Back to Live Map
        </button>
      </div>
    </div>
  );
}

// ───────────── AppShell Layout with Transitions ─────────────
const LandingLazy = lazy(() => import('./pages/Landing.jsx'));
const HospitalViewLazy = lazy(() => import('./pages/HospitalView.jsx'));
const JoinQueueLazy = lazy(() => import('./pages/JoinQueue.jsx'));
const LiveTicketLazy = lazy(() => import('./pages/LiveTicket.jsx'));

function AppShell() {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="h-screen h-[100dvh] flex flex-col min-h-0 overflow-hidden"
      >
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center p-8 bg-[var(--bg)]">
              <div className="shimmer-box w-full max-w-xl h-64 rounded-3xl" />
            </div>
          }
        >
          <Routes location={location}>
            {/* Customer Routes under CustomerLayout */}
            <Route element={<CustomerLayout />}>
              <Route path="/" element={<LandingLazy />} />
              <Route path="/hospital/:orgId" element={<HospitalViewLazy />} />
              <Route path="/join/:orgId/:deptId" element={<JoinQueueLazy />} />
              <Route path="/t/:token" element={<LiveTicketLazy />} />
              <Route path="/board/:orgId" element={<RouteStub name="Public Wait Board" />} />
            </Route>

            {/* Public Staff & Admin Login */}
            <Route path="/staff/login" element={<RouteStub name="Staff Login" />} />
            <Route path="/admin/login" element={<RouteStub name="Admin Login" />} />

            {/* Protected Staff Routes under StaffLayout */}
            <Route element={<RequireStaff />}>
              <Route element={<StaffLayout />}>
                <Route path="/staff" element={<RouteStub name="Staff Dashboard" />} />
              </Route>
            </Route>

            {/* Protected Admin Routes under AdminLayout */}
            <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<RouteStub name="Admin Dashboard" />} />
                <Route path="/admin/orgs/:id" element={<RouteStub name="Admin Org Details" />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

// ───────────── Root Bootstrap ─────────────
const rootElement = document.getElementById('root');
if (rootElement) {
  if (!window.__neverq_root) {
    window.__neverq_root = createRoot(rootElement);
  }
  window.__neverq_root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
