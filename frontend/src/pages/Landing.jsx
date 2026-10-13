import {
  Component,
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight,
  Bike,
  Bone,
  Building2,
  Car,
  Check,
  ChevronDown,
  Clock,
  CloudOff,
  Crosshair,
  DoorOpen,
  Eye,
  Footprints,
  HeartPulse,
  History,
  Home,
  LayoutGrid,
  List,
  Loader2,
  Locate,
  Map as MapIcon,
  MapPin,
  Navigation,
  Phone,
  Pill,
  RefreshCw,
  Search,
  SearchX,
  Share2,
  Siren,
  Stethoscope,
  Star,
  Ticket,
  WifiOff,
  X,
} from "lucide-react";

import { Logo, ThemeToggle, USE_MOCK, api, useLiveData, useMediaQuery, useOnline, useSocketStatus, useTheme } from "../main.jsx";
import { DEMO_HOME_PRESET, estimateTravel, storage, waitTone } from "../lib/mock.js";

/* ════════════════════════════════════════════════════════════════════════════
   Constants & helpers
   ════════════════════════════════════════════════════════════════════════════ */

const MAP_STYLE_LIGHT = import.meta.env.VITE_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";
const MAP_STYLE_DARK = import.meta.env.VITE_MAP_STYLE_DARK || "https://tiles.openfreemap.org/styles/dark";
const MAP_CENTER = [80.2341, 13.0418];
const PEEK = 112;
const EMPTY = [];

const cn = (...parts) => parts.filter(Boolean).join(" ");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const styleFor = (theme) => (theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);

const TONE = {
  good: { soft: "bg-wait-good/15 text-wait-good", dot: "bg-wait-good", label: "Short wait" },
  mid: { soft: "bg-wait-mid/15 text-wait-mid", dot: "bg-wait-mid", label: "Moderate wait" },
  bad: { soft: "bg-wait-bad/15 text-wait-bad", dot: "bg-wait-bad", label: "Long wait" },
};

const MODE_META = {
  walk: { label: "Walk", by: "on foot", Icon: Footprints, gmaps: "walking" },
  bike: { label: "Bike", by: "by bike", Icon: Bike, gmaps: "bicycling" },
  car: { label: "Car", by: "by car", Icon: Car, gmaps: "driving" },
};
const MODE_OPTIONS = Object.entries(MODE_META).map(([value, m]) => ({
  value,
  label: m.label,
  Icon: m.Icon,
  aria: `Travel ${m.by}`,
  hideLabelSmall: true,
}));
const SORT_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "fastest", label: "Fastest overall" },
];

const DEPT_ICONS = [
  ["general", Stethoscope],
  ["opd", Stethoscope],
  ["eye", Eye],
  ["cardio", HeartPulse],
  ["pharm", Pill],
  ["ortho", Bone],
];

function DeptIcon({ name, size = 18 }) {
  const key = name.toLowerCase();
  const hit = DEPT_ICONS.find(([k]) => key.includes(k));
  const Icon = name === "All" ? LayoutGrid : hit ? hit[1] : Building2;
  return <Icon size={size} aria-hidden="true" />;
}

/** Department shown for a hospital: the selected one, or the shortest wait when "All". */
function repDept(org, deptName) {
  if (!org) return null;
  if (deptName && deptName !== "All") return org.departments.find((d) => d.name === deptName) || null;
  return org.departments.reduce((best, d) => (!best || d.eta.mid < best.eta.mid ? d : best), null);
}

function toMarker({ org, dept }) {
  return {
    id: org.id,
    lat: org.lat,
    lng: org.lng,
    name: org.name,
    deptName: dept.name,
    mid: dept.eta.mid,
    tone: waitTone(dept.eta.mid),
  };
}

function toLoc(preset) {
  return { lat: preset.lat, lng: preset.lng, label: preset.shortLabel || preset.label, source: "preset", presetId: preset.id };
}

const formatClock = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function relTime(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 20) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

function sessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════════════════════════════ */

function useNow(ms = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function useViewportHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return h;
}

function useElementHeight(el) {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setH(0);
      return undefined;
    }
    setH(Math.round(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(([entry]) => setH(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return h;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

function useFocusTrap(ref, active, onEscape) {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  });
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const previous = document.activeElement;
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    (focusables()[0] || node).focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function" && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/* ════════════════════════════════════════════════════════════════════════════
   Small UI atoms
   ════════════════════════════════════════════════════════════════════════════ */

/** Number that tweens between values without remounting. */
function AnimatedNumber({ value, className = "" }) {
  const ref = useRef(null);
  const shown = useRef(value);
  const initial = useRef(value).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reduce || shown.current === value) {
      shown.current = value;
      node.textContent = String(value);
      return undefined;
    }
    const controls = animate(shown.current, value, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = String(Math.round(v));
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = String(value);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {initial}
    </span>
  );
}

function WaitBadge({ dept }) {
  const tone = TONE[waitTone(dept.eta.mid)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular", tone.soft)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
      <span className="sr-only">{tone.label}: </span>
      <span>
        <AnimatedNumber value={dept.eta.low} />–<AnimatedNumber value={dept.eta.high} /> min
      </span>
    </span>
  );
}

function StarButton({ saved, name, onToggle, className = "" }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.82 }}
      className={cn(
        "grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent-2/15",
        saved ? "text-accent-2" : "text-ink-muted",
        className,
      )}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      onClick={onToggle}
    >
      <Star size={21} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </motion.button>
  );
}

function UpdatedAgo({ ts }) {
  const now = useNow(10000);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <Clock size={13} aria-hidden="true" /> Updated {relTime(ts || now, now)}
    </span>
  );
}

function LiveStatus({ online, socketStatus, stale, updatedAt }) {
  let kind = "live";
  let text = "Live";
  if (!online) {
    kind = "offline";
    text = updatedAt ? `Offline · Last updated ${formatClock(updatedAt)}` : "Offline";
  } else if (stale || socketStatus === "reconnecting" || socketStatus === "connecting" || socketStatus === "disconnected") {
    kind = "wait";
    text = "Reconnecting…";
  }
  const color = kind === "live" ? "text-success" : kind === "wait" ? "text-wait-mid" : "text-danger";
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-2 text-xs font-semibold", color)}>
      <span className={cn("live-dot", kind === "live" && "is-live")} aria-hidden="true" />
      {text}
    </span>
  );
}

function Highlight({ text, q }) {
  const t = q.trim();
  if (!t) return text;
  const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-accent-2/40 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Segmented({ id, label, value, onChange, options, className = "" }) {
  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    onChange(options[n].value);
    e.currentTarget.querySelectorAll('[role="radio"]')[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("segmented", className)} onKeyDown={onKeyDown}>
      {options.map(({ value: v, label: text, Icon, aria, hideLabelSmall }) => {
        const checked = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={aria}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(v)}
          >
            {checked && (
              <motion.span
                layoutId={`seg-${id}`}
                className="seg-thumb"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span className={hideLabelSmall ? "sr-only xs:not-sr-only" : undefined}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Top bar, emergency strip, offline banner
   ════════════════════════════════════════════════════════════════════════════ */

function TopBar({ ticket }) {
  return (
    <div className="flex min-h-14 items-center gap-1 px-3">
      <Link to="/" aria-label="NeverQ home" className="mr-auto inline-flex min-h-12 items-center">
        <Logo wordmarkClassName={ticket ? "max-[399px]:hidden" : ""} />
      </Link>
      {ticket && (
        <Link
          to={`/t/${encodeURIComponent(ticket.token)}`}
          aria-label={`My ticket ${ticket.label}`}
          className="chip !gap-1.5 !px-3 !text-sm"
        >
          <Ticket size={16} aria-hidden="true" />
          <span className="tabular">{ticket.label}</span>
        </Link>
      )}
      <ThemeToggle />
      <Link
        to="/staff/login"
        className="inline-flex min-h-12 items-center rounded-xl px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        Staff
      </Link>
    </div>
  );
}

function EmergencyStrip({ onDismiss }) {
  return (
    <div
      role="region"
      aria-label="Emergency information"
      className="flex items-center gap-1.5 rounded-2xl border border-danger/30 bg-danger/10 py-1 pl-3 pr-1 backdrop-blur-md"
    >
      <Siren size={18} className="shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[0.75rem] font-medium leading-tight">
        Medical emergency? Call 112 or go to the emergency department.
      </p>
      <a href="tel:112" className="btn btn-danger btn-sm !gap-1.5 !px-3" aria-label="Call 112">
        <Phone size={16} aria-hidden="true" /> 112
      </a>
      <button
        type="button"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-danger/10"
        aria-label="Dismiss emergency notice"
        onClick={onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function OfflineBanner({ updatedAt }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-wait-mid/40 bg-wait-mid/15 px-3 py-2 text-sm font-medium">
        <WifiOff size={16} className="shrink-0 text-wait-mid" aria-hidden="true" />
        <span>
          You're offline. Showing last loaded data{updatedAt ? ` · Last updated ${formatClock(updatedAt)}` : ""}.
        </span>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Search (typeahead)
   ════════════════════════════════════════════════════════════════════════════ */

function SearchBox({ orgs, deptNames, onPickOrg, onPickDept }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recents, setRecents] = useState(() => storage.getRecentSearches());
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) {
      return recents
        .filter((r) => (r.type === "org" ? orgs.some((o) => o.id === r.id) : deptNames.includes(r.label)))
        .map((r) => ({ ...r, key: `r-${r.type}-${r.label}`, recent: true, sub: r.type === "org" ? "Hospital" : "Department" }));
    }
    const o = orgs
      .filter((x) => x.name.toLowerCase().includes(t))
      .slice(0, 5)
      .map((x) => ({ type: "org", label: x.name, id: x.id, sub: x.address, key: `o-${x.id}` }));
    const d = deptNames
      .filter((n) => n.toLowerCase().includes(t))
      .slice(0, 5)
      .map((n) => ({ type: "dept", label: n, sub: "Department", key: `d-${n}` }));
    return [...o, ...d];
  }, [q, orgs, deptNames, recents]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (item) => {
    if (item.type === "org") {
      const org = orgs.find((o) => o.id === item.id);
      if (!org) return;
      onPickOrg(org);
    } else {
      onPickDept(item.label);
    }
    setRecents(storage.pushRecentSearch({ type: item.type, label: item.label, id: item.id }));
    setQ("");
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (e.key === "Enter") {
      const idx = active >= 0 ? active : q.trim() ? 0 : -1;
      if (open && idx >= 0 && items[idx]) {
        e.preventDefault();
        pick(items[idx]);
      }
    } else if (e.key === "Escape") {
      if (open || q) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQ("");
        setActive(-1);
      }
    }
  };

  const showPanel = open && (items.length > 0 || q.trim().length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <div className="field">
        <Search size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search hospitals and departments"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
          placeholder="Search hospital or department"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button
            type="button"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-brand/10"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {showPanel && (
        <div className="glass absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl shadow-card">
          {!q.trim() && items.length > 0 && (
            <div className="flex items-center justify-between px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <History size={13} aria-hidden="true" /> Recent
              </span>
              <button
                type="button"
                className="min-h-12 px-2 normal-case text-brand"
                onClick={() => {
                  storage.clearRecentSearches();
                  setRecents([]);
                }}
              >
                Clear
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Suggestions" className="scroll-contain max-h-72 overflow-y-auto p-1.5">
            {items.map((item, i) => (
              <li
                key={item.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5",
                  i === active ? "bg-brand/12 ring-1 ring-brand/40" : "hover:bg-brand/8",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint text-brand">
                  {item.type === "org" ? <Building2 size={18} aria-hidden="true" /> : <DeptIcon name={item.label} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    <Highlight text={item.label} q={q} />
                  </span>
                  <span className="block truncate text-xs text-ink-muted">{item.sub}</span>
                </span>
              </li>
            ))}
            {items.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">No matches for "{q.trim()}"</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Department chips
   ════════════════════════════════════════════════════════════════════════════ */

function DeptChips({ names, value, onChange }) {
  const all = useMemo(() => ["All", ...names], [names]);
  const reduce = useReducedMotion();
  const refs = useRef({});
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    refs.current[value]?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [value, reduce]);

  const onKeyDown = (e) => {
    const i = all.indexOf(value);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % all.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + all.length) % all.length;
    else return;
    e.preventDefault();
    onChange(all[n]);
    refs.current[all[n]]?.focus();
  };

  return (
    <div>
      <p className="sr-only px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted lg:not-sr-only">
        What do you need?
      </p>
      <div className="fade-x no-scrollbar -mx-2 overflow-x-auto overscroll-x-contain">
        <div role="tablist" aria-label="What do you need?" className="flex w-max gap-2 px-4 py-1" onKeyDown={onKeyDown}>
          {all.map((name) => (
            <motion.button
              key={name}
              ref={(el) => {
                refs.current[name] = el;
              }}
              type="button"
              role="tab"
              aria-selected={value === name}
              tabIndex={value === name ? 0 : -1}
              className="chip"
              whileTap={{ scale: 0.94 }}
              onClick={() => onChange(name)}
            >
              <DeptIcon name={name} size={16} />
              {name}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Controls (sort / mode / location)
   ════════════════════════════════════════════════════════════════════════════ */

function Controls({
  sort,
  onSort,
  mode,
  onMode,
  loc,
  presets,
  open,
  onToggle,
  locating,
  onUseMyLocation,
  onChoosePin,
  onPreset,
  onClear,
}) {
  const panelId = useId();
  return (
    <section aria-label="Sort and location controls" className="flex flex-col gap-3">
      <Segmented
        id="sort"
        label="Sort by"
        value={sort}
        onChange={onSort}
        options={SORT_OPTIONS}
        className="w-full [&>button]:flex-1 [&>button]:px-2"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented id="mode" label="Travel mode" value={mode} onChange={onMode} options={MODE_OPTIONS} />
        <button
          type="button"
          className="btn btn-soft btn-sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <MapPin size={16} aria-hidden="true" /> Location
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {loc ? (
          <span className="chip !gap-1.5 !pr-1">
            <MapPin size={15} className="text-brand" aria-hidden="true" />
            <span className="max-w-[12rem] truncate">{loc.label}</span>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-brand/10"
              aria-label="Clear location"
              onClick={onClear}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <span className="text-ink-muted">No location set · travel times unavailable</span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="group"
            aria-label="Location options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="card flex flex-col gap-1 p-2">
              <button type="button" className="btn btn-ghost !justify-start" onClick={onUseMyLocation} disabled={locating}>
                {locating ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Locate size={18} className="text-brand" aria-hidden="true" />
                )}
                {locating ? "Locating…" : "Use my location"}
              </button>
              <button type="button" className="btn btn-ghost !justify-start" onClick={onChoosePin}>
                <Crosshair size={18} className="text-accent" aria-hidden="true" /> Choose on map
              </button>
              <p className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Presets</p>
              {presets.map((p) => {
                const current = loc?.presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost !justify-start"
                    aria-pressed={current}
                    onClick={() => onPreset(p)}
                  >
                    {p.id === "home" ? (
                      <Home size={18} className="text-brand" aria-hidden="true" />
                    ) : (
                      <Building2 size={18} className="text-brand" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">{p.label}</span>
                    {current && <Check size={18} className="text-success" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Cards
   ════════════════════════════════════════════════════════════════════════════ */

const HospitalCard = memo(function HospitalCard({ row, mode, sort, selected, saved, deptFilter, onSelect, onToggleSave, onJoin }) {
  const { org, dept, travel } = row;
  const meta = MODE_META[mode];
  const ModeIcon = meta.Icon;
  return (
    <article className={cn("card p-4 transition-shadow", selected && "ring-2 ring-brand")} aria-label={org.name}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-heading text-base font-bold leading-tight">{org.name}</h3>
            {org.demo && <span className="badge-demo">DEMO</span>}
          </div>
          <p className="tabular mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <ModeIcon size={15} className="shrink-0" aria-hidden="true" />
            {travel ? `approx. ${travel.minutes} min ${meta.by} · ${travel.km} km` : "Set a location for travel time"}
          </p>
          {travel && sort === "fastest" && (
            <p className="tabular mt-0.5 text-xs font-semibold text-brand">
              approx. {travel.minutes + dept.eta.mid} min travel + wait
            </p>
          )}
        </div>
        <StarButton saved={saved} name={org.name} onToggle={() => onToggleSave(org)} className="-mr-2 -mt-1" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <WaitBadge dept={dept} />
        <span className="text-sm font-semibold">{deptFilter === "All" ? `Shortest: ${dept.name}` : dept.name}</span>
      </div>
      <p className="tabular mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
        <DoorOpen size={15} aria-hidden="true" />
        {plural(dept.openCounters, "counter", "counters")} open · {dept.waitingCount} waiting
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{dept.confidence.label}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-primary"
          aria-label={`Join ${dept.name} queue at ${org.name}`}
          onClick={() => onJoin(org, dept)}
        >
          Join <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-soft" aria-label={`Details for ${org.name}`} onClick={() => onSelect(org.id)}>
          Details
        </button>
      </div>
    </article>
  );
});

function SkeletonCard() {
  return (
    <div className="card p-4" aria-hidden="true">
      <div className="skeleton h-5 w-2/3" />
      <div className="skeleton mt-3 h-4 w-1/2" />
      <div className="skeleton mt-4 h-8 w-40 !rounded-full" />
      <div className="skeleton mt-3 h-4 w-3/4" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="skeleton h-12 !rounded-2xl" />
        <div className="skeleton h-12 !rounded-2xl" />
      </div>
    </div>
  );
}

function SavedRecentRow({ items, saved, onSelect, onToggleSave }) {
  if (!items.length) return null;
  return (
    <section aria-label="Saved and recent hospitals">
      <h2 className="mb-2 px-1 font-heading text-sm font-bold">Saved &amp; recent</h2>
      <div className="fade-x no-scrollbar -mx-4 overflow-x-auto overscroll-x-contain">
        <ul className="flex w-max snap-x gap-3 px-4 py-1">
          {items.map(({ org, dept, kind }) => {
            const isSaved = saved.includes(org.id);
            return (
              <li key={org.id} className="w-56 shrink-0 snap-start">
                <div className="card relative">
                  <button
                    type="button"
                    className="block min-h-12 w-full rounded-card p-3 pr-12 text-left"
                    aria-label={`Open ${org.name}`}
                    onClick={() => onSelect(org.id)}
                  >
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">{kind}</span>
                    <span className="mt-0.5 block truncate font-heading text-sm font-bold">{org.name}</span>
                    {dept && (
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <WaitBadge dept={dept} />
                      </span>
                    )}
                    {dept && <span className="mt-1 block truncate text-xs text-ink-muted">{dept.name}</span>}
                  </button>
                  <StarButton
                    saved={isSaved}
                    name={org.name}
                    onToggle={() => onToggleSave(org)}
                    className="absolute right-0.5 top-0.5"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function TicketResume({ ticket, orgName }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Active ticket"
      className="card relative overflow-hidden p-4"
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-grad-accent" aria-hidden="true" />
      <div className="flex items-center gap-3 pl-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-grad-brand text-on-brand">
          <Ticket size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Your ticket</p>
          <p className="tabular truncate font-heading text-lg font-bold">{ticket.label}</p>
          <p className="truncate text-sm text-ink-muted">{[ticket.name, orgName].filter(Boolean).join(" · ")}</p>
        </div>
        <Link to={`/t/${encodeURIComponent(ticket.token)}`} className="btn btn-primary btn-sm">
          Open
        </Link>
      </div>
    </motion.section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Hospital detail (sheet on mobile, side card on desktop)
   ════════════════════════════════════════════════════════════════════════════ */

function DetailHeader({ org, saved, onToggleSave, onClose }) {
  return (
    <div className="flex items-start gap-1 px-4 pb-2">
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-heading text-lg font-bold leading-tight">{org.name}</h2>
          {org.demo && <span className="badge-demo">DEMO</span>}
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
          <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{org.address}</span>
        </p>
      </div>
      <StarButton saved={saved} name={org.name} onToggle={() => onToggleSave(org)} />
      <button
        type="button"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-brand/10"
        aria-label="Close hospital details"
        onClick={onClose}
      >
        <X size={22} aria-hidden="true" />
      </button>
    </div>
  );
}

async function shareOrg(org) {
  const url = `${window.location.origin}/hospital/${encodeURIComponent(org.id)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: org.name, text: `${org.name} — live wait times`, url });
      toast.success("Shared", { id: "share" });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { id: "share" });
  } catch (err) {
    if (err?.name === "AbortError") return;
    toast.error("Couldn't share or copy the link", { id: "share" });
  }
}

function DetailBody({ org, mode, travel, deptFilter, onJoin }) {
  const meta = MODE_META[mode];
  const ModeIcon = meta.Icon;
  const active = repDept(org, deptFilter);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${org.lat},${org.lng}&travelmode=${meta.gmaps}`;
  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-tint/70 px-3 py-2.5">
        <p className="tabular flex items-center gap-2 text-sm font-semibold">
          <ModeIcon size={17} className="text-brand" aria-hidden="true" />
          {travel ? `approx. ${travel.minutes} min ${meta.by} · ${travel.km} km` : "Set a location for travel time"}
        </p>
        <UpdatedAgo ts={org.updatedAt} />
      </div>
      <ul className="flex flex-col gap-2.5" aria-label="Departments">
        {org.departments.map((d) => (
          <li
            key={d.id}
            className={cn(
              "rounded-2xl border p-3",
              active && d.id === active.id ? "border-brand/50 bg-brand/5" : "border-border bg-surface",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint text-brand">
                <DeptIcon name={d.name} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="tabular text-xs text-ink-muted">
                  {plural(d.openCounters, "counter", "counters")} open · {d.waitingCount} waiting
                </p>
              </div>
              <WaitBadge dept={d} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="min-w-0 text-xs text-ink-muted">{d.confidence.label}</p>
              <button
                type="button"
                className="btn btn-primary btn-sm shrink-0"
                aria-label={`Join ${d.name} queue at ${org.name}`}
                onClick={() => onJoin(org, d)}
              >
                Join
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <a href={directions} target="_blank" rel="noopener noreferrer" className="btn btn-soft">
          <Navigation size={17} aria-hidden="true" /> Directions
        </a>
        <button type="button" className="btn btn-soft" onClick={() => shareOrg(org)}>
          <Share2 size={17} aria-hidden="true" /> Share
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Bottom sheet (spring, drag handle, snap points, optional dismiss)
   ════════════════════════════════════════════════════════════════════════════ */

function Sheet({ label, snaps, snapIndex, onSnapChange, onDismiss, header, children, modal = false, zClass = "z-30" }) {
  const vh = useViewportHeight();
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const nodeRef = useRef(null);
  const dragged = useRef(false);

  const visible = snaps.map((s) => (s <= 1 ? Math.round(vh * s) : Math.round(s)));
  const H = Math.max(...visible);
  const offsets = visible.map((v) => H - v);
  const idx = Math.min(snapIndex, offsets.length - 1);
  const target = offsets[idx];
  const y = useMotionValue(H);
  const spring = reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

  useEffect(() => {
    const c = animate(y, target, reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: 0.9 });
    return () => c.stop();
  }, [target, reduce, y]);

  useFocusTrap(nodeRef, modal, onDismiss);

  const onDragEnd = (_, info) => {
    const projected = y.get() + info.velocity.y * 0.18;
    if (onDismiss && projected > offsets[0] + 70) {
      onDismiss();
      return;
    }
    let best = 0;
    offsets.forEach((o, i) => {
      if (Math.abs(o - projected) < Math.abs(offsets[best] - projected)) best = i;
    });
    if (best === idx) animate(y, offsets[best], spring);
    else onSnapChange?.(best);
  };

  return (
    <motion.div
      ref={nodeRef}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      aria-label={label}
      tabIndex={-1}
      className={cn("sheet fixed inset-x-0 bottom-0 flex flex-col outline-none", zClass)}
      style={{ y, height: H }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{ top: Math.min(...offsets), bottom: onDismiss ? H : Math.max(...offsets) }}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={onDragEnd}
      exit={{ y: H, transition: spring }}
    >
      <div
        className="touch-none"
        onPointerDown={(e) => {
          dragged.current = false;
          controls.start(e);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.stopPropagation();
            e.preventDefault();
            dragged.current = false;
          }
        }}
      >
        <button
          type="button"
          className="sheet-handle-zone w-full"
          aria-label={`Resize ${label}`}
          onClick={() => onSnapChange?.((idx + 1) % offsets.length)}
        >
          <span className="sheet-handle" />
        </button>
        {header}
      </div>
      <div
        className="scroll-contain min-h-0 flex-1 overflow-y-auto"
        style={{ paddingBottom: `calc(${offsets[idx]}px + env(safe-area-inset-bottom, 0px))` }}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Map (maplibre-gl loaded lazily → its own chunk)
   ════════════════════════════════════════════════════════════════════════════ */

let maplibregl = null;

const MapViewLazy = lazy(async () => {
  const [mod] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
  maplibregl = mod.default || mod;
  return { default: MapView };
});

class MapBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.onError?.("load", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const MarkerPill = memo(function MarkerPill({ m, selected }) {
  const reduce = useReducedMotion();
  const prev = useRef(m.mid);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (prev.current === m.mid) return undefined;
    prev.current = m.mid;
    setPulse((p) => p + 1);
    const t = setTimeout(() => setPulse(0), 1200);
    return () => clearTimeout(t);
  }, [m.mid]);
  return (
    <motion.span
      className="block"
      style={{ transformOrigin: "50% 100%" }}
      initial={reduce ? false : { scale: 0, opacity: 0, y: 10 }}
      animate={{ scale: selected ? 1.22 : 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
    >
      <span className={cn("nq-pill", `tone-${m.tone}`, selected && "is-selected")}>
        {pulse > 0 && <span key={pulse} className="nq-ping" aria-hidden="true" />}
        <AnimatedNumber value={m.mid} />
        <span className="text-[0.68rem] font-semibold opacity-90">min</span>
      </span>
    </motion.span>
  );
});

const markerLabel = (m) => `${m.name}, ${m.deptName}: wait about ${m.mid} minutes`;

const MapView = memo(function MapView({
  markers,
  selectedId,
  onSelect,
  user,
  theme,
  pickMode,
  onPick,
  onFail,
  onGeolocate,
  padding,
  focus,
  focusOffset,
  topInset,
  bottomInset,
}) {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [els, setEls] = useState({});
  const objs = useRef(new Map());
  const userMarker = useRef(null);
  const themeRef = useRef(theme);
  const applied = useRef(theme);
  const live = useRef({});
  const paddingRef = useRef(padding);
  const markersRef = useRef(markers);
  const reduce = useReducedMotion();

  useEffect(() => {
    live.current = { onSelect, onPick, onFail, onGeolocate, pickMode };
    paddingRef.current = padding;
    markersRef.current = markers;
    themeRef.current = theme;
  });

  // Create / destroy the map exactly once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !maplibregl) return undefined;
    let instance;
    try {
      instance = new maplibregl.Map({
        container: el,
        style: styleFor(themeRef.current),
        center: MAP_CENTER,
        zoom: 11,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 150,
      });
    } catch (err) {
      live.current.onFail?.("init", err);
      return undefined;
    }
    applied.current = themeRef.current;
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    // Present but never auto-triggered: geolocation only runs when the user taps the control.
    const geo = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false, timeout: 8000 },
      trackUserLocation: false,
      showUserLocation: false,
      showAccuracyCircle: false,
    });
    instance.addControl(geo, "top-right");
    geo.on("geolocate", (e) => live.current.onGeolocate?.({ lat: e.coords.latitude, lng: e.coords.longitude }));
    geo.on("error", (e) => live.current.onGeolocate?.(null, e));

    let loaded = false;
    let lastTileToast = 0;
    instance.on("load", () => {
      loaded = true;
    });
    instance.on("error", (e) => {
      if (!loaded && !e?.sourceId && !e?.tile) {
        live.current.onFail?.("style", e?.error);
        return;
      }
      if (Date.now() - lastTileToast > 20000) {
        lastTileToast = Date.now();
        toast.error("Map tiles failed to load. The list still works.", { id: "tiles-failed" });
      }
    });
    instance.on("click", (e) => {
      if (!live.current.pickMode) return;
      if (e.originalEvent?.target?.closest?.(".nq-marker")) return;
      live.current.onPick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    const canvas = instance.getCanvas();
    const onLost = (e) => {
      e.preventDefault();
      live.current.onFail?.("webgl");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) instance.resize();
      });
    });
    ro.observe(el);

    const objects = objs.current;
    setMap(instance);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      objects.forEach((o) => {
        o.el.removeEventListener("click", o.onClick);
        o.marker.remove();
      });
      objects.clear();
      if (userMarker.current) {
        userMarker.current.remove();
        userMarker.current = null;
      }
      instance.remove();
      setEls({});
      setMap(null);
    };
  }, []);

  // Theme: swap style; DOM markers are unaffected.
  useEffect(() => {
    if (!map || applied.current === theme) return;
    applied.current = theme;
    try {
      map.setStyle(styleFor(theme));
    } catch {
      /* style swap failure leaves the previous style in place */
    }
  }, [map, theme]);

  // Markers: create/remove DOM elements; content rendered via portals.
  useEffect(() => {
    if (!map) return;
    const current = objs.current;
    const ids = new Set(markers.map((m) => m.id));
    let changed = false;
    current.forEach((o, id) => {
      if (!ids.has(id)) {
        o.el.removeEventListener("click", o.onClick);
        o.marker.remove();
        current.delete(id);
        changed = true;
      }
    });
    markers.forEach((m) => {
      const existing = current.get(m.id);
      if (existing) {
        existing.marker.setLngLat([m.lng, m.lat]);
        existing.el.setAttribute("aria-label", markerLabel(m));
        return;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "nq-marker";
      el.setAttribute("aria-label", markerLabel(m));
      const onClick = () => {
        if (!live.current.pickMode) live.current.onSelect?.(m.id);
      };
      el.addEventListener("click", onClick);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.lng, m.lat]).addTo(map);
      current.set(m.id, { marker, el, onClick });
      changed = true;
    });
    if (changed) setEls(Object.fromEntries(Array.from(current, ([id, o]) => [id, o.el])));
  }, [map, markers]);

  useEffect(() => {
    objs.current.forEach((o, id) => {
      o.el.style.zIndex = id === selectedId ? "3" : "";
    });
  }, [selectedId, els]);

  // User location dot.
  const uLat = user?.lat;
  const uLng = user?.lng;
  useEffect(() => {
    if (!map) return;
    if (uLat == null || uLng == null) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Your location");
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([uLng, uLat]).addTo(map);
    } else {
      userMarker.current.setLngLat([uLng, uLat]);
    }
  }, [map, uLat, uLng]);

  // Fit to visible hospitals + user whenever the visible set (or user) changes.
  const fitKey = `${markers.map((m) => m.id).join("|")}|${uLat != null ? `${uLat.toFixed(4)},${uLng.toFixed(4)}` : ""}`;
  useEffect(() => {
    if (!map) return;
    const pts = markersRef.current.map((m) => [m.lng, m.lat]);
    if (uLat != null) pts.push([uLng, uLat]);
    if (!pts.length) return;
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => bounds.extend(p));
    try {
      map.resize();
      map.fitBounds(bounds, { padding: paddingRef.current, maxZoom: 14.5, duration: reduce ? 0 : 600 });
    } catch {
      /* container not measurable yet */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  // Fly to a focused hospital.
  useEffect(() => {
    if (!map || !focus) return;
    const m = markersRef.current.find((x) => x.id === focus.id);
    if (!m) return;
    map.flyTo({
      center: [m.lng, m.lat],
      zoom: Math.max(map.getZoom(), 14),
      offset: focusOffset,
      duration: reduce ? 0 : 700,
      essential: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus]);

  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn("nq-map absolute inset-0", pickMode && "is-picking")}
        style={{ "--map-top": `${topInset}px`, "--map-bottom": `${bottomInset}px` }}
      />
      {Object.entries(els).map(([id, el]) => {
        const m = byId.get(id);
        return m ? createPortal(<MarkerPill m={m} selected={id === selectedId} />, el, id) : null;
      })}
    </>
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   Landing page
   ════════════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  const navigate = useNavigate();
  const { resolved: theme } = useTheme();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const online = useOnline();
  const socketStatus = useSocketStatus();
  const vh = useViewportHeight();

  /* ── data ── */
  const fetchOrgs = useCallback(() => api.listOrgs({}), []);
  const { data, error, loading, updatedAt, refresh } = useLiveData(fetchOrgs, {
    room: "orgs",
    event: "queue:update",
    subscribe: api.subscribe || undefined,
    cacheKey: "nq-orgs-cache",
  });
  const orgs = data || EMPTY;
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  /* ── ui state ── */
  const [deptFilter, setDeptFilter] = useState("All");
  const [sort, setSort] = useState("nearest");
  const [mode, setMode] = useState("car");
  const [loc, setLoc] = useState(() => (USE_MOCK ? toLoc(DEMO_HOME_PRESET) : null));
  const [locOpen, setLocOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [view, setView] = useState("map");
  const [mapFailed, setMapFailed] = useState(false);
  const [listSnap, setListSnap] = useState(1);
  const [detailSnap, setDetailSnap] = useState(0);
  const [saved, setSaved] = useState(() => storage.getSaved());
  const [recent, setRecent] = useState(() => storage.getRecent());
  const [ticket, setTicket] = useState(() => storage.getActiveTicket());
  const [emergencyHidden, setEmergencyHidden] = useState(() => sessionGet("nq-emergency-dismissed") === "1");
  const [stackEl, setStackEl] = useState(null);
  const stackH = useElementHeight(stackEl);
  const detailCardRef = useRef(null);

  /* ── presets ── */
  const presets = useMemo(
    () => [
      DEMO_HOME_PRESET,
      ...orgs.map((o) => ({ id: `at-${o.id}`, label: `At ${o.name}`, shortLabel: o.name, lat: o.lat, lng: o.lng })),
    ],
    [orgs],
  );

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !orgs.length) return;
    restored.current = true;
    const flag = storage.getLastLocation();
    if (!flag || flag === "map") return;
    const p = presets.find((x) => x.id === flag);
    if (p) setLoc(toLoc(p));
  }, [orgs.length, presets]);

  /* ── active ticket verification ── */
  const ticketToken = ticket?.token;
  useEffect(() => {
    if (!ticketToken) return undefined;
    let cancelled = false;
    api.getTicket(ticketToken).catch((err) => {
      if (!cancelled && (err?.status === 404 || err?.status === 410)) {
        storage.clearActiveTicket();
        setTicket(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ticketToken]);

  /* ── derived ── */
  const deptNames = useMemo(() => {
    const set = new Set();
    orgs.forEach((o) => o.departments.forEach((d) => set.add(d.name)));
    return Array.from(set);
  }, [orgs]);

  useEffect(() => {
    if (orgs.length && deptFilter !== "All" && !deptNames.includes(deptFilter)) setDeptFilter("All");
  }, [orgs.length, deptFilter, deptNames]);

  const rows = useMemo(() => {
    const list = orgs
      .map((org) => {
        const dept = repDept(org, deptFilter);
        const travel = loc ? estimateTravel(loc, org, mode) : null;
        return { org, dept, travel, score: (travel ? travel.minutes : 0) + (dept ? dept.eta.mid : 0) };
      })
      .filter((r) => r.dept);
    if (sort === "fastest") list.sort((a, b) => a.score - b.score);
    else if (loc) list.sort((a, b) => a.travel.km - b.travel.km);
    else list.sort((a, b) => a.org.name.localeCompare(b.org.name));
    return list;
  }, [orgs, deptFilter, loc, mode, sort]);

  const selectedOrg = selectedId ? orgsById.get(selectedId) : null;
  const selectedTravel = selectedOrg && loc ? estimateTravel(loc, selectedOrg, mode) : null;

  useEffect(() => {
    if (selectedId && orgs.length && !orgsById.has(selectedId)) setSelectedId(null);
  }, [selectedId, orgs.length, orgsById]);

  const markers = useMemo(() => {
    const list = rows.map(toMarker);
    if (selectedOrg && !rows.some((r) => r.org.id === selectedOrg.id)) {
      const d = repDept(selectedOrg, "All");
      if (d) list.push(toMarker({ org: selectedOrg, dept: d }));
    }
    return list;
  }, [rows, selectedOrg]);

  const mapUser = useMemo(() => (loc ? { lat: loc.lat, lng: loc.lng } : null), [loc]);

  const savedRecentItems = useMemo(() => {
    const ids = [...saved, ...recent.filter((id) => !saved.includes(id))];
    return ids
      .map((id) => {
        const org = orgsById.get(id);
        if (!org) return null;
        return { org, dept: repDept(org, deptFilter) || repDept(org, "All"), kind: saved.includes(id) ? "Saved" : "Recent" };
      })
      .filter(Boolean);
  }, [saved, recent, orgsById, deptFilter]);

  /* ── effects: recents, online toasts, refresh errors, esc ── */
  useEffect(() => {
    if (selectedId) setRecent(storage.pushRecent(selectedId));
    setDetailSnap(0);
  }, [selectedId]);

  const prevOnline = useRef(online);
  useEffect(() => {
    if (prevOnline.current === online) return;
    prevOnline.current = online;
    if (online) toast.success("Back online", { id: "net-state" });
    else toast.warning("You're offline. Showing last loaded data.", { id: "net-state" });
  }, [online]);

  const hadError = useRef(false);
  useEffect(() => {
    if (error && data && !hadError.current) {
      toast.error(error.message || "Couldn't refresh wait times", {
        id: "net-error",
        action: { label: "Retry", onClick: () => refresh() },
      });
    }
    hadError.current = Boolean(error);
  }, [error, data, refresh]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (pickMode) setPickMode(false);
      else if (selectedId) setSelectedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pickMode, selectedId]);

  useEffect(() => {
    if (isDesktop && selectedId) detailCardRef.current?.focus({ preventScroll: true });
  }, [isDesktop, selectedId]);

  /* ── handlers ── */
  const selectOrg = useCallback((id) => {
    setSelectedId(id);
    setFocus({ id, n: Date.now() });
  }, []);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const toggleSave = useCallback((org) => {
    const next = storage.toggleSaved(org.id);
    setSaved(next);
    if (next.includes(org.id)) toast.success(`Saved ${org.name}`, { id: `save-${org.id}` });
    else toast(`Removed ${org.name} from saved`, { id: `save-${org.id}` });
  }, []);

  const joinDept = useCallback((org, dept) => navigate(`/join/${encodeURIComponent(org.id)}/${encodeURIComponent(dept.id)}`), [navigate]);

  const applyPreset = useCallback((p) => {
    setLoc(toLoc(p));
    storage.setLastLocation(p.id);
    setLocOpen(false);
    toast.success(`Location set: ${p.shortLabel || p.label}`, { id: "loc" });
  }, []);

  const clearLoc = useCallback(() => {
    setLoc(null);
    storage.setLastLocation(null);
  }, []);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available on this device. Pick a preset or place a pin.", { id: "loc" });
      setLocOpen(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "My location", source: "gps" });
        storage.setLastLocation(null);
        setLocOpen(false);
        toast.success("Location set", { id: "loc" });
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1 ? "Location permission denied." : err.code === 3 ? "Location request timed out." : "Location unavailable.";
        toast.error(`${msg} Choose a preset or place a pin.`, { id: "loc" });
        setLocOpen(true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const onGeolocate = useCallback((pt, err) => {
    if (pt) {
      setLoc({ lat: pt.lat, lng: pt.lng, label: "My location", source: "gps" });
      storage.setLastLocation(null);
      toast.success("Location set", { id: "loc" });
    } else if (err) {
      toast.error("Couldn't get your location. Choose a preset or place a pin.", { id: "loc" });
      setLocOpen(true);
    }
  }, []);

  const startPick = useCallback(() => {
    if (mapFailed) {
      toast.error("The map is unavailable. Choose a preset instead.", { id: "loc" });
      return;
    }
    setPickMode(true);
    setLocOpen(false);
    setSelectedId(null);
    if (!isDesktop) {
      setView("map");
      setListSnap(0);
    }
  }, [mapFailed, isDesktop]);

  const handlePick = useCallback(({ lat, lng }) => {
    setLoc({ lat, lng, label: "Pinned location", source: "map" });
    storage.setLastLocation("map");
    setPickMode(false);
    toast.success("Location set on map", { id: "loc" });
  }, []);

  const onMapFail = useCallback((kind) => {
    setMapFailed(true);
    setView("list");
    setPickMode(false);
    toast.error(
      kind === "webgl" ? "Map graphics stopped. Showing the list instead." : "The map couldn't load. Showing the list instead.",
      { id: "map-fail" },
    );
  }, []);

  const dismissEmergency = useCallback(() => {
    sessionSet("nq-emergency-dismissed", "1");
    setEmergencyHidden(true);
  }, []);

  const pickDept = useCallback((name) => setDeptFilter(name), []);

  /* ── map props ── */
  const padding = useMemo(
    () =>
      isDesktop
        ? { top: 80, bottom: 80, left: 80, right: 80 }
        : { top: stackH + 24, bottom: Math.round(vh * 0.5) + 16, left: 36, right: 36 },
    [isDesktop, stackH, vh],
  );
  const focusOffset = useMemo(() => (isDesktop ? [190, 0] : [0, -Math.round(vh * 0.2)]), [isDesktop, vh]);
  const mapTopInset = isDesktop ? 0 : stackH + 8;
  const mapBottomInset = isDesktop ? 0 : PEEK + 8;

  /* ── composed pieces ── */
  const hasData = orgs.length > 0;
  const showSkeleton = loading && !hasData;
  const staleError = Boolean(error) && hasData;

  const topStack = (
    <div className="flex flex-col gap-2">
      <div className={isDesktop ? "" : "glass rounded-3xl shadow-card"}>
        <TopBar ticket={ticket} />
      </div>
      <AnimatePresence initial={false}>{!online && <OfflineBanner key="offline" updatedAt={updatedAt} />}</AnimatePresence>
      {!emergencyHidden && <EmergencyStrip onDismiss={dismissEmergency} />}
      <SearchBox orgs={orgs} deptNames={deptNames} onPickOrg={(org) => selectOrg(org.id)} onPickDept={pickDept} />
      <DeptChips names={deptNames} value={deptFilter} onChange={setDeptFilter} />
    </div>
  );

  const listHeader = (
    <div className="flex min-h-14 items-center gap-3 px-4 pb-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-base font-bold">
          {showSkeleton ? "Loading hospitals…" : `${plural(rows.length, "hospital", "hospitals")}${deptFilter !== "All" ? ` · ${deptFilter}` : ""}`}
        </h2>
        <LiveStatus online={online} socketStatus={socketStatus} stale={staleError} updatedAt={updatedAt} />
      </div>
      {!isDesktop && !mapFailed && (
        <button
          type="button"
          className="btn btn-soft btn-sm"
          aria-label={view === "map" ? "Show list view" : "Show map view"}
          onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
        >
          {view === "map" ? <List size={17} aria-hidden="true" /> : <MapIcon size={17} aria-hidden="true" />}
          {view === "map" ? "List" : "Map"}
        </button>
      )}
    </div>
  );

  const resultsBody = showSkeleton ? (
    <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </motion.div>
  ) : error && !hasData ? (
    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 text-center" role="alert">
      <CloudOff size={32} className="mx-auto text-danger" aria-hidden="true" />
      <p className="mt-3 font-heading text-base font-bold">Couldn't load hospitals</p>
      <p className="mt-1 text-sm text-ink-muted">{error.message || "Something went wrong."}</p>
      <button type="button" className="btn btn-primary mx-auto mt-4" onClick={() => refresh()}>
        <RefreshCw size={16} aria-hidden="true" /> Retry
      </button>
    </motion.div>
  ) : rows.length === 0 ? (
    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 text-center">
      <SearchX size={32} className="mx-auto text-ink-muted" aria-hidden="true" />
      <p className="mt-3 font-heading text-base font-bold">No hospital offers {deptFilter}</p>
      <button type="button" className="btn btn-soft mx-auto mt-4" onClick={() => setDeptFilter("All")}>
        Clear filter
      </button>
    </motion.div>
  ) : (
    <motion.ul
      key="list"
      className="flex flex-col gap-3"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      {rows.map((row) => (
        <motion.li
          key={row.org.id}
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } } }}
        >
          <HospitalCard
            row={row}
            mode={mode}
            sort={sort}
            deptFilter={deptFilter}
            selected={row.org.id === selectedId}
            saved={saved.includes(row.org.id)}
            onSelect={selectOrg}
            onToggleSave={toggleSave}
            onJoin={joinDept}
          />
        </motion.li>
      ))}
    </motion.ul>
  );

  const listContent = (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-1">
      {ticket && <TicketResume ticket={ticket} orgName={orgsById.get(ticket.orgId)?.name} />}
      <Controls
        sort={sort}
        onSort={setSort}
        mode={mode}
        onMode={setMode}
        loc={loc}
        presets={presets}
        open={locOpen}
        onToggle={() => setLocOpen((v) => !v)}
        locating={locating}
        onUseMyLocation={useMyLocation}
        onChoosePin={startPick}
        onPreset={applyPreset}
        onClear={clearLoc}
      />
      <SavedRecentRow items={savedRecentItems} saved={saved} onSelect={selectOrg} onToggleSave={toggleSave} />
      <section aria-label="Hospitals" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {resultsBody}
        </AnimatePresence>
      </section>
    </div>
  );

  const mapNode = mapFailed ? (
    isDesktop ? (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="card max-w-xs p-6 text-center">
          <MapIcon size={30} className="mx-auto text-ink-muted" aria-hidden="true" />
          <p className="mt-3 font-heading text-base font-bold">Map unavailable</p>
          <p className="mt-1 text-sm text-ink-muted">The list has everything the map does.</p>
          <button type="button" className="btn btn-soft mx-auto mt-4" onClick={() => setMapFailed(false)}>
            <RefreshCw size={16} aria-hidden="true" /> Retry map
          </button>
        </div>
      </div>
    ) : null
  ) : (
    <MapBoundary onError={onMapFail}>
      <Suspense fallback={<div className="skeleton absolute inset-0 !rounded-none" aria-hidden="true" />}>
        <MapViewLazy
          markers={markers}
          selectedId={selectedId}
          onSelect={selectOrg}
          user={mapUser}
          theme={theme}
          pickMode={pickMode}
          onPick={handlePick}
          onFail={onMapFail}
          onGeolocate={onGeolocate}
          padding={padding}
          focus={focus}
          focusOffset={focusOffset}
          topInset={mapTopInset}
          bottomInset={mapBottomInset}
        />
      </Suspense>
    </MapBoundary>
  );

  const pickBar = (
    <AnimatePresence>
      {pickMode && (
        <div
          key="pickbar"
          className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
          style={{ top: isDesktop ? 16 : stackH + 8 }}
        >
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass pointer-events-auto flex items-center gap-2 rounded-2xl py-1 pl-4 pr-1 shadow-card"
          >
            <Crosshair size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="text-sm font-semibold">Tap the map to place your pin</span>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPickMode(false)}>
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const detailHeader = selectedOrg ? (
    <DetailHeader org={selectedOrg} saved={saved.includes(selectedOrg.id)} onToggleSave={toggleSave} onClose={closeDetail} />
  ) : null;
  const detailBody = selectedOrg ? (
    <DetailBody org={selectedOrg} mode={mode} travel={selectedTravel} deptFilter={deptFilter} onJoin={joinDept} />
  ) : null;

  /* ── layout ── */
  return (
    <div className="relative h-dvh w-full overflow-hidden text-ink lg:flex">
      {isDesktop && (
        <aside
          aria-label="Hospitals"
          className="glass relative z-10 flex h-full w-[420px] shrink-0 flex-col overflow-y-auto scroll-contain !border-y-0 !border-l-0"
        >
          <div className="glass sticky top-0 z-20 !border-x-0 !border-t-0 px-3 pb-3 pt-safe">{topStack}</div>
          <div className="pt-3">
            {listHeader}
            {listContent}
          </div>
        </aside>
      )}

      <div className="relative h-full min-w-0 flex-1">
        <div
          className={cn("absolute inset-0", !isDesktop && view === "list" && "invisible")}
          aria-hidden={!isDesktop && view === "list" ? true : undefined}
        >
          {mapNode}
        </div>

        {pickBar}

        {isDesktop && (
          <AnimatePresence>
            {selectedOrg && (
              <motion.aside
                key="detail-card"
                ref={detailCardRef}
                tabIndex={-1}
                aria-label={`${selectedOrg.name} details`}
                className="absolute bottom-4 left-4 top-4 z-20 flex w-[380px] max-w-[calc(100%-2rem)] flex-col outline-none"
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              >
                <div className="glass flex max-h-full flex-col overflow-hidden rounded-3xl pt-4 shadow-card">
                  {detailHeader}
                  <div className="scroll-contain min-h-0 flex-1 overflow-y-auto">{detailBody}</div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        )}

        {!isDesktop && (
          <>
            <div ref={setStackEl} className="pointer-events-none absolute inset-x-0 top-0 z-20 px-safe pt-safe">
              <div className="pointer-events-auto mx-auto max-w-2xl p-2">{topStack}</div>
            </div>

            {view === "list" && (
              <div
                className="scroll-contain absolute inset-0 z-10 overflow-y-auto bg-bg"
                style={{ paddingTop: stackH + 8 }}
              >
                <div className="mx-auto max-w-2xl pb-safe">
                  <div className="pt-2">{listHeader}</div>
                  {listContent}
                </div>
              </div>
            )}

            <AnimatePresence>
              {view === "map" && !selectedOrg && (
                <Sheet
                  key="list-sheet"
                  label="Hospital list"
                  snaps={[PEEK, 0.5, Math.max(0.55 * vh, vh - stackH - 12)]}
                  snapIndex={listSnap}
                  onSnapChange={setListSnap}
                  header={listHeader}
                >
                  <div className="mx-auto max-w-2xl">{listContent}</div>
                </Sheet>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedOrg && (
                <motion.button
                  key="scrim"
                  type="button"
                  tabIndex={-1}
                  aria-label="Close hospital details"
                  className="fixed inset-0 z-40 cursor-default"
                  style={{ background: "var(--scrim)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeDetail}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {selectedOrg && (
                <Sheet
                  key="detail-sheet"
                  modal
                  zClass="z-50"
                  label={`${selectedOrg.name} details`}
                  snaps={[0.5, 0.9]}
                  snapIndex={detailSnap}
                  onSnapChange={setDetailSnap}
                  onDismiss={closeDetail}
                  header={detailHeader}
                >
                  <div className="mx-auto max-w-2xl">{detailBody}</div>
                </Sheet>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
