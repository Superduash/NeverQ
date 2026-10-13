import {
  Component,
  StrictMode,
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "sonner";
import { io } from "socket.io-client";
import { ArrowLeft, Home, Monitor, Moon, RotateCw, Sun } from "lucide-react";
import { registerSW } from "virtual:pwa-register";

import "./index.css";
import { mockApi, storage } from "./lib/mock.js";

/* ════════════════════════════════════════════════════════════════════════════
   Environment
   ════════════════════════════════════════════════════════════════════════════ */

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

/* ════════════════════════════════════════════════════════════════════════════
   Small hooks
   ════════════════════════════════════════════════════════════════════════════ */

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function subscribeOnline(cb) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Theme (light | dark | system)
   ════════════════════════════════════════════════════════════════════════════ */

const ThemeContext = createContext({ pref: "system", resolved: "light", setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

const DARK_MQ = "(prefers-color-scheme: dark)";
const THEME_COLORS = { light: "#f4fbff", dark: "#00111c" };

function ThemeProvider({ children }) {
  const [pref, setPref] = useState(() => storage.getTheme());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_MQ).matches);

  useEffect(() => {
    const mql = window.matchMedia(DARK_MQ);
    const onChange = (e) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "nq-theme") setPref(storage.getTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolved = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-pref", pref);
    root.style.colorScheme = resolved;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", THEME_COLORS[resolved]);
      m.removeAttribute("media");
    });
  }, [pref, resolved]);

  const setTheme = useCallback((value) => {
    const next = value === "light" || value === "dark" ? value : "system";
    storage.setTheme(next);
    setPref(next);
  }, []);

  const value = useMemo(() => ({ pref, resolved, setTheme }), [pref, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ className = "" }) {
  const { pref, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();
  const Current = (THEME_OPTIONS.find((o) => o.value === pref) || THEME_OPTIONS[2]).Icon;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) wrapRef.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [open]);

  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(wrapRef.current?.querySelectorAll('[role="menuitemradio"]') || []);
    const idx = items.indexOf(document.activeElement);
    const next = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost !px-0 w-12"
        aria-label={`Theme: ${pref}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={pref}
            className="grid place-items-center"
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Current size={20} aria-hidden="true" />
          </motion.span>
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Theme"
            onKeyDown={onMenuKey}
            className="glass absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl p-1.5 shadow-card"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{ transformOrigin: "top right" }}
          >
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={pref === value}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors hover:bg-brand/10 ${
                  pref === value ? "text-brand" : "text-ink"
                }`}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Logo
   ════════════════════════════════════════════════════════════════════════════ */

/*
  LOGO PLACEHOLDER — replace /public/logo.svg. Brand colours: light #0077b6→#00b4d8 gradient on #f4fbff; dark #22d3ee on #00111c. Square, works at 24px, transparent background.
*/
export function Logo({ size = 32, showWordmark = true, className = "", wordmarkClassName = "" }) {
  const [imgOk, setImgOk] = useState(true);
  const radius = Math.max(6, Math.round(size * 0.28));
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {imgOk ? (
        <img
          src="/logo.svg"
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: radius }}
          onError={() => setImgOk(false)}
          draggable={false}
        />
      ) : (
        <span
          aria-hidden="true"
          className="shrink-0 border-2 border-dashed border-brand/60 bg-brand/5"
          style={{ width: size, height: size, borderRadius: radius }}
        />
      )}
      {showWordmark && (
        <span className={`font-heading text-lg font-extrabold tracking-tight text-ink ${wordmarkClassName}`}>NeverQ</span>
      )}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   API client facade
   ════════════════════════════════════════════════════════════════════════════ */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request(path, { method = "GET", body, timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-Device-Id": storage.getDeviceId(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) throw new ApiError(res.status, json?.message || json?.error || res.statusText || "Request failed");
    return json && Object.prototype.hasOwnProperty.call(json, "data") ? json.data : json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === "AbortError") throw new ApiError(0, "The request timed out");
    throw new ApiError(0, navigator.onLine === false ? "You are offline" : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "All") sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = USE_MOCK
  ? {
      mock: true,
      request,
      listOrgs: (p) => mockApi.listOrgs(p),
      getOrg: (id) => mockApi.getOrg(id),
      getTicket: (token) => mockApi.getTicket(token),
      subscribe: (cb) => mockApi.subscribe(cb),
    }
  : {
      mock: false,
      request,
      listOrgs: ({ lat, lng, dept } = {}) => request(`/orgs${qs({ lat, lng, dept })}`),
      getOrg: (id) => request(`/orgs/${encodeURIComponent(id)}`),
      getTicket: (token) => request(`/tickets/${encodeURIComponent(token)}`),
      subscribe: null,
    };

/* ════════════════════════════════════════════════════════════════════════════
   Socket client singleton + connection-state store
   ════════════════════════════════════════════════════════════════════════════ */

const socketStore = {
  state: USE_MOCK ? "mock" : "disconnected", // mock | disconnected | connecting | connected | reconnecting
  listeners: new Set(),
};
function setSocketState(next) {
  if (socketStore.state === next) return;
  socketStore.state = next;
  socketStore.listeners.forEach((l) => l());
}
export function useSocketStatus() {
  return useSyncExternalStore(
    (cb) => {
      socketStore.listeners.add(cb);
      return () => socketStore.listeners.delete(cb);
    },
    () => socketStore.state,
    () => socketStore.state,
  );
}

let socket = null;
let idleTimer = null;
const rooms = new Map(); // room -> refcount

export function getSocket() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 10000,
  });
  socket.on("connect", () => {
    setSocketState("connected");
    rooms.forEach((_, room) => socket.emit("room:join", room));
  });
  socket.on("disconnect", () => setSocketState("reconnecting"));
  socket.on("connect_error", () => setSocketState("reconnecting"));
  socket.io.on("reconnect_attempt", () => setSocketState("reconnecting"));
  socket.io.on("reconnect_failed", () => setSocketState("disconnected"));
  return socket;
}

function acquireRoom(room) {
  clearTimeout(idleTimer);
  const s = getSocket();
  const count = rooms.get(room) || 0;
  rooms.set(room, count + 1);
  if (s.connected) {
    if (count === 0) s.emit("room:join", room);
  } else if (!s.active) {
    setSocketState("connecting");
    s.connect();
  }
  return s;
}

function releaseRoom(room) {
  const count = (rooms.get(room) || 1) - 1;
  if (count > 0) {
    rooms.set(room, count);
    return;
  }
  rooms.delete(room);
  if (socket?.connected) socket.emit("room:leave", room);
  if (rooms.size === 0) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (rooms.size === 0 && socket) {
        socket.disconnect();
        setSocketState("disconnected");
      }
    }, 1500);
  }
}

export function useSocketRoom(room, event, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (USE_MOCK || !room || !event) return undefined;
    const s = acquireRoom(room);
    const fn = (...args) => handlerRef.current?.(...args);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
      releaseRoom(room);
    };
  }, [room, event]);
}

/* ════════════════════════════════════════════════════════════════════════════
   useLiveData — fetch + socket/subscribe payloads + 10 s polling safety net
   ════════════════════════════════════════════════════════════════════════════ */

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}
function writeCache(key, data, ts) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts, data }));
  } catch {
    /* quota / private mode */
  }
}

function defaultMerge(prev, payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.orgs)) return payload.orgs;
  if (payload && payload.id && Array.isArray(prev)) {
    return prev.some((x) => x.id === payload.id) ? prev.map((x) => (x.id === payload.id ? payload : x)) : [...prev, payload];
  }
  return payload;
}

export function useLiveData(fetcher, { room, event, interval = 10000, subscribe, cacheKey, merge = defaultMerge } = {}) {
  const [state, setState] = useState(() => {
    const cached = cacheKey ? readCache(cacheKey) : null;
    return {
      data: cached ? cached.data : null,
      error: null,
      loading: !cached,
      updatedAt: cached ? cached.ts : null,
      fromCache: Boolean(cached),
    };
  });
  const fetcherRef = useRef(fetcher);
  const mergeRef = useRef(merge);
  const seq = useRef(0);
  const alive = useRef(false);
  useEffect(() => {
    fetcherRef.current = fetcher;
    mergeRef.current = merge;
  });

  const applyPayload = useCallback((payload) => {
    if (!alive.current) return;
    seq.current += 1; // invalidates any older in-flight fetch
    setState((s) => ({
      data: mergeRef.current(s.data, payload),
      error: null,
      loading: false,
      updatedAt: Date.now(),
      fromCache: false,
    }));
  }, []);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    try {
      const result = await fetcherRef.current();
      if (!alive.current || id !== seq.current) return;
      setState((s) => ({
        data: mergeRef.current(s.data, result),
        error: null,
        loading: false,
        updatedAt: Date.now(),
        fromCache: false,
      }));
    } catch (error) {
      if (!alive.current || id !== seq.current) return;
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    }, interval);
    const onWake = () => {
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    const unsubscribe = typeof subscribe === "function" ? subscribe(applyPayload) : undefined;
    return () => {
      alive.current = false;
      clearInterval(tick);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [interval, refresh, subscribe, applyPayload]);

  useSocketRoom(room, event, applyPayload);

  useEffect(() => {
    if (cacheKey && state.data && !state.fromCache) writeCache(cacheKey, state.data, state.updatedAt);
  }, [cacheKey, state.data, state.fromCache, state.updatedAt]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    updatedAt: state.updatedAt,
    fromCache: state.fromCache,
    refresh,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   ErrorBoundary + skeleton
   ════════════════════════════════════════════════════════════════════════════ */

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("NeverQ UI error:", error, info?.componentStack);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-safe grid min-h-dvh place-items-center">
        <div role="alert" className="card m-4 w-full max-w-md p-8 text-center">
          <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-muted">The page failed to load. Reload to try again.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              <RotateCw size={18} aria-hidden="true" /> Reload
            </button>
            <a className="btn btn-soft" href="/">
              <Home size={18} aria-hidden="true" /> Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}

function PageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4" role="status" aria-label="Loading">
      <div className="skeleton h-12 w-full max-w-sm" />
      <div className="skeleton h-14 w-full" />
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 w-28 shrink-0 !rounded-full" />
        ))}
      </div>
      <div className="skeleton h-40 w-full !rounded-card" />
      <div className="skeleton h-40 w-full !rounded-card" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Routes
   ════════════════════════════════════════════════════════════════════════════ */

const Landing = lazy(() => import("./pages/Landing.jsx"));

function Stub({ title }) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key !== "default" ? navigate(-1) : navigate("/"));
  const entries = Object.entries(params);
  return (
    <div className="p-safe min-h-dvh">
      <div className="grid min-h-dvh place-items-center px-5 py-8">
        <div className="card w-full max-w-md p-8 text-center">
          <Logo className="mb-6" />
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          {entries.length > 0 && (
            <p className="tabular mt-2 break-all text-sm text-ink-muted">
              {entries.map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <button type="button" className="btn btn-primary" onClick={goBack}>
              <ArrowLeft size={18} aria-hidden="true" /> Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="p-safe min-h-dvh">
      <div className="grid min-h-dvh place-items-center px-5 py-8">
        <div className="card w-full max-w-md p-8 text-center">
          <p className="tabular font-heading text-6xl font-extrabold text-grad-brand">404</p>
          <h1 className="mt-2 font-heading text-xl font-bold">Page not found</h1>
          <div className="mt-6 flex justify-center">
            <Link to="/" className="btn btn-primary">
              <Home size={18} aria-hidden="true" /> Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const STUB_ROUTES = [
  { path: "/hospital/:orgId", title: "Hospital" },
  { path: "/join/:orgId/:deptId", title: "Join queue" },
  { path: "/t/:token", title: "Ticket" },
  { path: "/staff/login", title: "Staff login" },
  { path: "/staff", title: "Staff" },
  { path: "/admin/login", title: "Admin login" },
  { path: "/admin", title: "Admin" },
  { path: "/admin/orgs/:id", title: "Admin · Hospital" },
  { path: "/board/:orgId", title: "Board" },
];

function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={location.pathname}
          className="min-h-dvh"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16, ease: "easeOut" }}
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Routes location={location}>
                <Route path="/" element={<Landing />} />
                {STUB_ROUTES.map((r) => (
                  <Route key={r.path} path={r.path} element={<Stub title={r.title} />} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Toaster (themed)
   ════════════════════════════════════════════════════════════════════════════ */

function ThemedToaster() {
  const { resolved } = useTheme();
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <Toaster
      theme={resolved}
      position={desktop ? "bottom-right" : "top-center"}
      richColors
      closeButton
      offset={16}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 12, right: 12 }}
      style={{
        "--normal-bg": "var(--surface)",
        "--normal-text": "var(--ink)",
        "--normal-border": "var(--border)",
        "--border-radius": "16px",
        fontFamily: "var(--font-sans)",
      }}
      toastOptions={{ duration: 4000 }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Bootstrap
   ════════════════════════════════════════════════════════════════════════════ */

if (import.meta.env.PROD) {
  try {
    registerSW({ immediate: true });
  } catch {
    /* service worker unavailable */
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AppShell />
          <ThemedToaster />
        </BrowserRouter>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
