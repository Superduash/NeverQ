import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Footprints, Bike, Car,
  List, Map as MapIcon, X, LocateFixed, Star,
  Users, ShieldAlert, Sparkles, RefreshCw,
  Compass, Eye, HeartPulse, Stethoscope, Pill, Bone, Layers,
  CheckCircle2, CornerUpRight, PanelLeftClose, PanelLeftOpen,
  ChevronUp, ChevronDown
} from 'lucide-react';
import {
  WAIT_THRESHOLDS, DEMO_HOME, DEFAULT_SAVED_HOME, LOCATION_PRESETS, ALL_DEPARTMENTS,
  estimateTravel, waitStatus, storage
} from '../lib/mock.js';
import { Logo } from '../main.jsx';
import { ThemeToggle, useTheme } from '../lib/theme.jsx';
import { api } from '../lib/api.js';
import { useLiveData } from '../lib/socket.js';
import { notify } from '../lib/notify.js';
import { NOTIFICATION_MESSAGES } from '../lib/messages.js';
import {
  Button, IconButton, Chip, Badge, Segmented,
  EmptyState, ErrorState, Skeleton
} from '../components/ui/index.js';
import { MapView } from '../components/map/index.js';

// Department name to Lucide icon mapping
const DEPT_ICONS = {
  'All': Layers,
  'General OPD': Stethoscope,
  'Eye Clinic': Eye,
  'Cardiology': HeartPulse,
  'Pharmacy': Pill,
  'Orthopaedics': Bone,
};

export default function Landing() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  // ───────────── State ─────────────
  const [query, setQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [sortMode, setSortMode] = useState('nearest'); // 'nearest' | 'fastest'
  const [travelMode, setTravelMode] = useState('car'); // 'walk' | 'bike' | 'car'
  const [userLocation, setUserLocation] = useState(() => {
    const lastPreset = storage.getLastLocationPreset();
    if (lastPreset === 'saved_home') {
      return storage.getSavedHome() || DEFAULT_SAVED_HOME;
    }
    const preset = LOCATION_PRESETS.find((p) => p.id === lastPreset);
    return preset || DEMO_HOME;
  });
  const [isPinMode, setIsPinMode] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [savedOrgIds, setSavedOrgIds] = useState(() => storage.getSavedOrgs());
  const [recentOrgIds, setRecentOrgIds] = useState(() => storage.getRecentOrgs());
  const [activeTicket, setActiveTicket] = useState(() => storage.getActiveTicket());
  const [emergencyDismissed, setEmergencyDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('nq-dismiss-emergency') === 'true';
    } catch {
      return false;
    }
  });

  // Desktop Collapsible Sidebar Preference
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nq-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Mobile Views & Bottom Sheet
  const [mobileView, setMobileView] = useState('map'); // 'map' | 'list'
  const [sheetSnap, setSheetSnap] = useState('peek'); // 'peek' | 'half' | 'full'
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const searchInputRef = useRef(null);

  // ───────────── Active Ticket Verification (Phase 2.3) ─────────────
  useEffect(() => {
    const currentTicket = storage.getActiveTicket();
    if (!currentTicket?.token) return;

    api.getTicket(currentTicket.token)
      .then((verified) => {
        if (['done', 'cancelled', 'expired'].includes(verified.status)) {
          storage.setActiveTicket(null);
          setActiveTicket(null);
        } else {
          setActiveTicket(verified);
        }
      })
      .catch((err) => {
        // Silent clear on 404 or expired ticket
        if (err.status === 404 || err.code === 'NOT_FOUND') {
          storage.setActiveTicket(null);
          setActiveTicket(null);
        }
      });
  }, []);

  // Toggle Sidebar on Desktop with safe persistence
  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nq-sidebar-collapsed', String(next));
      } catch (err) {
        console.warn('Could not persist sidebar collapse state:', err);
      }
      return next;
    });
  };

  const handleDismissEmergency = () => {
    setEmergencyDismissed(true);
    try {
      sessionStorage.setItem('nq-dismiss-emergency', 'true');
    } catch (err) {
      console.warn('Could not persist emergency notice dismissal:', err);
    }
  };

  // Live query fetcher using api.listOrgs (Phase 2.1)
  const fetcher = useCallback(async () => {
    const list = await api.listOrgs({
      lat: userLocation?.lat,
      lng: userLocation?.lng,
      dept: selectedDept,
    });
    setLastUpdatedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    return list;
  }, [userLocation, selectedDept]);

  const { data: rawHospitals, loading, error, refresh } = useLiveData(fetcher, {
    room: 'orgs',
    event: 'queue:update',
    interval: 10000,
  });

  // Online / offline listeners
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); notify.success(NOTIFICATION_MESSAGES.ONLINE); };
    const onOffline = () => { setIsOnline(false); notify.error(NOTIFICATION_MESSAGES.OFFLINE); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Enrich hospitals with distance, ETA, travel time & sort
  const enrichedHospitals = useMemo(() => {
    if (!rawHospitals) return [];
    const origin = userLocation || DEMO_HOME;
    const isGPS = userLocation?.type === 'gps' || userLocation?.id === 'gps';
    const isSavedHome = userLocation?.type === 'saved' || userLocation?.id === 'saved_home';
    const isCustomPin = userLocation?.type === 'pin' || userLocation?.id === 'custom';
    const hasRealDistance = isGPS || isSavedHome || isCustomPin;

    return rawHospitals.map((h) => {
      const travel = estimateTravel(origin, { lat: h.lat, lng: h.lng }, travelMode);
      const deptObj =
        selectedDept === 'All'
          ? h.departments.find((d) => d.name === 'General OPD') || h.departments[0]
          : h.departments.find((d) => d.name === selectedDept) || h.departments[0];

      const waitMid = deptObj?.eta?.mid || 15;
      const totalTime = travel.minutes + waitMid;

      let distanceLabel = '';
      let travelLabel = '';

      if (isGPS) {
        distanceLabel = `${travel.km} km away`;
        travelLabel = `~${travel.minutes} min (${travelMode})`;
      } else if (isSavedHome) {
        distanceLabel = `${travel.km} km from saved Home`;
        travelLabel = `~${travel.minutes} min (saved Home)`;
      } else if (isCustomPin) {
        distanceLabel = `${travel.km} km from pin`;
        travelLabel = `~${travel.minutes} min from pin`;
      } else {
        // Never imply a real home-to-hospital distance from demo coordinates
        distanceLabel = 'Chennai demo area';
        travelLabel = 'GPS needed for distance';
      }

      return {
        ...h,
        selectedDept: deptObj,
        distanceKm: travel.km,
        travelMin: travel.minutes,
        totalMin: totalTime,
        status: waitStatus(waitMid),
        isSaved: savedOrgIds.includes(h.id),
        hasRealDistance,
        isGPS,
        isSavedHome,
        isCustomPin,
        distanceLabel,
        travelLabel,
      };
    }).sort((a, b) => {
      if (sortMode === 'fastest') {
        return a.totalMin - b.totalMin;
      }
      return a.distanceKm - b.distanceKm;
    });
  }, [rawHospitals, userLocation, travelMode, selectedDept, sortMode, savedOrgIds]);

  // Filtered by search query
  const filteredHospitals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enrichedHospitals;

    return enrichedHospitals.filter((h) => {
      const matchName = h.name.toLowerCase().includes(q);
      const matchArea = h.area ? h.area.toLowerCase().includes(q) : false;
      const matchDepts = h.departments.some((d) => d.name.toLowerCase().includes(q));
      return matchName || matchArea || matchDepts;
    });
  }, [enrichedHospitals, query]);

  // Selected hospital details
  const selectedHospital = useMemo(() => {
    return enrichedHospitals.find((h) => h.id === selectedHospitalId) || null;
  }, [enrichedHospitals, selectedHospitalId]);

  // Handle saving org (Phase 2.2 & 2.4)
  const toggleSave = (id, name, e) => {
    e?.stopPropagation();
    const next = storage.toggleSavedOrg(id);
    setSavedOrgIds(next);
    if (next.includes(id)) {
      notify.success(NOTIFICATION_MESSAGES.SAVED_ORG(name));
    } else {
      notify.info(NOTIFICATION_MESSAGES.UNSAVED_ORG(name));
    }
  };

  // Select hospital handler
  const handleSelectHospital = useCallback((id) => {
    setSelectedHospitalId(id);
    const updatedRecent = storage.addRecentOrg(id);
    setRecentOrgIds(updatedRecent);
    setSheetSnap('half');
  }, []);

  const handlePinPlaced = useCallback((coords) => {
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      setUserLocation({
        id: 'custom',
        type: 'pin',
        lat: coords.lat,
        lng: coords.lng,
        label: 'Custom Pin on Map',
      });
      setIsPinMode(false);
      notify.success(NOTIFICATION_MESSAGES.LOCATION_SET);
    }
  }, []);

  const handleSaveCurrentAsHome = useCallback((target) => {
    const loc = target || userLocation;
    if (!loc?.lat || !loc?.lng) return;
    const saved = {
      id: 'saved_home',
      type: 'saved',
      lat: loc.lat,
      lng: loc.lng,
      label: 'Saved Home',
      isSaved: true,
    };
    storage.setSavedHome(saved);
    setUserLocation(saved);
    storage.setLastLocationPreset('saved_home');
    setShowLocationMenu(false);
    notify.success('Saved Home location updated');
  }, [userLocation]);

  // Location handler: Geolocation
  const requestUserLocation = () => {
    setShowLocationMenu(false);
    if (!navigator.geolocation) {
      notify.error('Geolocation is not supported by your browser. Using Chennai demo area.');
      setShowLocationMenu(true);
      return;
    }
    notify.info('Requesting current GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          id: 'gps',
          type: 'gps',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Your GPS Location',
          isGPS: true,
        });
        storage.setLastLocationPreset('gps');
        notify.success('GPS location active — showing live distance');
      },
      (err) => {
        const msg = err.code === 1
          ? 'Location permission not granted. Showing Chennai demo area.'
          : 'Could not obtain GPS location. Showing Chennai demo area.';
        notify.error(msg);
        setShowLocationMenu(true);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Keyboard navigation for search
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setQuery('');
      e.target.blur();
    }
  };

  const handleCollapsedSearchClick = () => {
    setIsSidebarCollapsed(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 relative overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* ───────────── Header / Top Bar ───────────── */}
      <header className="shrink-0 sticky top-0 z-40 bg-[var(--surface-glass)] backdrop-blur-md border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          {/* Live indicator dot */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--surface-2)] text-[var(--ink-muted)]">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`} />
            <span className="hidden sm:inline">{isOnline ? 'Live' : 'Offline'}</span>
            <span className="text-[10px] text-[var(--ink-faint)] tnum font-semibold">({lastUpdatedTime})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Ticket Quick Chip */}
          {activeTicket && (
            <Link
              to={`/t/${activeTicket.token}`}
              className="touch-target px-3 py-1.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-xs font-bold flex items-center gap-1.5 shadow-[var(--shadow-glow)]"
            >
              <Sparkles size={14} />
              <span>Ticket #{activeTicket.label || activeTicket.token}</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('nq-assistant-dismissed');
              window.dispatchEvent(new CustomEvent('nq-assistant-open'));
            }}
            className="text-xs font-semibold px-2 py-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors flex items-center gap-1"
            title="Open Guided booking helper"
          >
            <span className="hidden sm:inline">Helper</span>
          </button>

          <Link
            to="/staff/login"
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Staff
          </Link>

          <ThemeToggle />
        </div>
      </header>

      {/* ───────────── Mobile Compact Emergency Notice (Dismissible) ───────────── */}
      {!emergencyDismissed && (
        <div className="lg:hidden shrink-0 border-b border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-2 flex items-center justify-between gap-2 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={15} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-[var(--ink)] block leading-tight">Medical emergency?</span>
              <span className="text-[11px] text-[var(--ink-faint)] block leading-tight truncate">
                Call 112 or visit an emergency department.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="tel:112"
              className="touch-target px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white font-bold text-xs shadow-xs"
            >
              Call 112
            </a>
            <button
              type="button"
              onClick={handleDismissEmergency}
              className="p-1 text-[var(--ink-faint)] hover:text-[var(--ink)] rounded"
              aria-label="Dismiss emergency notice"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────── Pin Placement Mode Bar ───────────── */}
      {isPinMode && (
        <div className="shrink-0 bg-[var(--accent)] text-white px-4 py-2 flex items-center justify-between text-xs font-bold z-40">
          <span>Tap anywhere on the map to place your origin pin.</span>
          <button
            type="button"
            onClick={() => setIsPinMode(false)}
            className="px-2.5 py-1 bg-white text-[var(--accent)] rounded font-bold hover:bg-white/90"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ───────────── Main Workspace Layout ───────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative overflow-hidden">
        {/* ═════════════════════════════════════════════════════════════
            DESKTOP SIDEBAR: Collapsible Rail / 420px Expanded Panel
            ═════════════════════════════════════════════════════════════ */}
        <aside
          className={`
            hidden lg:flex flex-col h-full min-h-0 border-r border-[var(--border)] bg-[var(--bg)]
            transition-[width] duration-300 ease-in-out z-30 shrink-0 relative
            ${isSidebarCollapsed ? 'w-[68px]' : 'w-[420px] xl:w-[450px]'}
          `}
          aria-label="Hospitals sidebar"
        >
          {isSidebarCollapsed ? (
            /* ──────── Collapsed Rail State (~68px) ──────── */
            <div className="flex flex-col items-center py-3 px-2 gap-3 h-full overflow-hidden select-none">
              <IconButton
                icon={<PanelLeftOpen size={18} />}
                label="Expand sidebar"
                onClick={toggleSidebar}
                variant="secondary"
              />

              <div className="w-8 h-[1px] bg-[var(--border)] my-1" />

              <IconButton
                icon={<Search size={18} />}
                label="Search hospitals"
                onClick={handleCollapsedSearchClick}
                variant="ghost"
              />

              <IconButton
                icon={<MapPin size={18} />}
                label="Select origin location"
                onClick={() => {
                  setIsSidebarCollapsed(false);
                  setShowLocationMenu(true);
                }}
                variant="ghost"
              />

              {activeTicket && (
                <Link
                  to={`/t/${activeTicket.token}`}
                  aria-label={`Active ticket #${activeTicket.label || activeTicket.token}`}
                  title={`Active ticket #${activeTicket.label || activeTicket.token}`}
                  className="p-2 rounded-xl bg-[var(--brand)]/15 text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white transition-colors"
                >
                  <Sparkles size={18} />
                </Link>
              )}
            </div>
          ) : (
            /* ──────── Expanded Sidebar State (~420px-450px) ──────── */
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              {/* Sidebar Header with Collapse Button */}
              <div className="p-4 pb-2 shrink-0 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-heading font-extrabold text-sm text-[var(--ink)] tracking-tight">
                    Hospitals & Live Queues
                  </h2>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-faint)] font-bold tnum">
                    {filteredHospitals.length}
                  </span>
                </div>

                <IconButton
                  icon={<PanelLeftClose size={18} />}
                  label="Collapse sidebar"
                  onClick={toggleSidebar}
                  variant="ghost"
                  size="sm"
                />
              </div>

              {/* Sidebar Scrollable Content */}
              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3.5 p-4">
                {/* Compact Emergency Notice (Inside Sidebar) */}
                {!emergencyDismissed && (
                  <CompactEmergencyNotice
                    onDismiss={handleDismissEmergency}
                    className="shrink-0"
                  />
                )}

                {/* Active Ticket Resume Card (Phase 2.2) */}
                {activeTicket && (
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[var(--brand)]/12 to-[var(--brand-2)]/12 border border-[var(--brand)]/30 flex items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="priority">My Ticket</Badge>
                        <span className="font-heading font-extrabold text-xs text-[var(--ink)]">
                          #{activeTicket.label || activeTicket.token}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-faint)] mt-0.5 truncate">
                        {activeTicket.org?.name || 'Active queue'} · {activeTicket.dept?.name || 'Live'}
                      </p>
                    </div>
                    <Link to={`/t/${activeTicket.token}`}>
                      <Button size="sm" variant="primary">
                        View
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Search Bar */}
                <div className="relative shrink-0">
                  <Search size={16} className="absolute left-3.5 top-3 text-[var(--ink-faint)]" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search hospital or department..."
                    aria-label="Search hospitals or departments"
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-medium focus:border-[var(--brand)] shadow-xs outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-3 top-2.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Department Chips (Horizontally Scrollable) */}
                <div className="shrink-0 -mx-1 px-1">
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth"
                    role="tablist"
                    aria-label="Department filters"
                  >
                    {ALL_DEPARTMENTS.map((deptName) => {
                      const Icon = DEPT_ICONS[deptName] || Stethoscope;
                      const active = selectedDept === deptName;
                      return (
                        <Chip
                          key={deptName}
                          active={active}
                          icon={<Icon size={13} />}
                          onClick={() => setSelectedDept(deptName)}
                        >
                          {deptName}
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                {/* Filters Row: Sort Mode & Travel Mode */}
                <div className="shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                  {/* Sort Mode */}
                  <Segmented
                    value={sortMode}
                    onChange={setSortMode}
                    options={[
                      { value: 'nearest', label: 'Nearest' },
                      { value: 'fastest', label: 'Fastest' },
                    ]}
                  />

                  {/* Travel Mode */}
                  <Segmented
                    value={travelMode}
                    onChange={setTravelMode}
                    options={[
                      { value: 'walk', label: '', icon: <Footprints size={14} /> },
                      { value: 'bike', label: '', icon: <Bike size={14} /> },
                      { value: 'car', label: '', icon: <Car size={14} /> },
                    ]}
                  />
                </div>

                {/* Dedicated Origin Location Bar (In-Flow, No Map Overlap) */}
                <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/60 p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-[var(--brand)]/15 text-[var(--brand)] shrink-0">
                        <MapPin size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block">
                            Origin Location
                          </span>
                          {userLocation?.isGPS && (
                            <span className="px-1.5 py-0.2 rounded-md bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] text-[9px] font-bold uppercase">
                              GPS Active
                            </span>
                          )}
                          {userLocation?.isSaved && (
                            <span className="px-1.5 py-0.2 rounded-md bg-[var(--brand)]/15 text-[var(--brand)] text-[9px] font-bold uppercase">
                              Saved Home
                            </span>
                          )}
                          {userLocation?.isDemo && (
                            <span className="px-1.5 py-0.2 rounded-md bg-[var(--surface-2)] text-[var(--ink-muted)] text-[9px] font-bold uppercase">
                              Demo Area
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-[var(--ink)] block truncate">
                          {userLocation?.label || 'Chennai demo area'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLocationMenu(!showLocationMenu)}
                      className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-semibold text-[var(--brand)] hover:border-[var(--brand)] shrink-0 flex items-center gap-1 transition-colors"
                      aria-expanded={showLocationMenu}
                    >
                      <span>{showLocationMenu ? 'Close' : 'Change'}</span>
                      {showLocationMenu ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {/* In-flow Collapsible Location Panel */}
                  <AnimatePresence>
                    {showLocationMenu && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="overflow-hidden flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]"
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={requestUserLocation}
                            className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] text-left flex items-center gap-2 text-xs font-medium transition-colors"
                          >
                            <LocateFixed size={14} className="text-[var(--brand)] shrink-0" />
                            <span className="truncate">GPS Location</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsPinMode(true);
                              setShowLocationMenu(false);
                            }}
                            className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] text-left flex items-center gap-2 text-xs font-medium transition-colors"
                          >
                            <Compass size={14} className="text-[var(--brand)] shrink-0" />
                            <span className="truncate">Pin on Map</span>
                          </button>
                        </div>

                        {userLocation?.type === 'pin' && (
                          <button
                            type="button"
                            onClick={() => handleSaveCurrentAsHome()}
                            className="p-1.5 rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-semibold hover:bg-[var(--brand)]/20 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 size={13} />
                            <span>Save Current Pin as Home</span>
                          </button>
                        )}

                        <div className="pt-1">
                          <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block mb-1">
                            Locations & Presets
                          </span>
                          <div className="flex flex-col gap-1">
                            {LOCATION_PRESETS.map((p) => {
                              const isSelected = userLocation?.id === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    if (p.id === 'saved_home') {
                                      const saved = storage.getSavedHome() || DEFAULT_SAVED_HOME;
                                      setUserLocation(saved);
                                      storage.setLastLocationPreset('saved_home');
                                    } else {
                                      setUserLocation(p);
                                      storage.setLastLocationPreset(p.id);
                                    }
                                    setShowLocationMenu(false);
                                  }}
                                  className={`p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors ${isSelected
                                      ? 'bg-[var(--surface)] border border-[var(--brand)] font-bold text-[var(--brand)] shadow-xs'
                                      : 'hover:bg-[var(--surface)] border border-transparent font-medium text-[var(--ink)]'
                                    }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="truncate">{p.label}</span>
                                    {p.isSaved && (
                                      <span className="px-1.5 py-0.2 rounded-md bg-[var(--brand)]/10 text-[var(--brand)] text-[9px] font-bold uppercase shrink-0">
                                        Saved
                                      </span>
                                    )}
                                    {p.isDemo && (
                                      <span className="px-1.5 py-0.2 rounded-md bg-[var(--surface-2)] text-[var(--ink-muted)] text-[9px] font-bold uppercase shrink-0">
                                        Demo
                                      </span>
                                    )}
                                  </div>
                                  {isSelected && <CheckCircle2 size={13} className="shrink-0 text-[var(--brand)]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Saved & Recent Horizontal Micro-Row (Phase 2.2) */}
                {(savedOrgIds.length > 0 || recentOrgIds.length > 0) && (
                  <div className="shrink-0 pt-2 border-t border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block mb-1">
                      Saved & Recent
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {enrichedHospitals
                        .filter((h) => savedOrgIds.includes(h.id) || recentOrgIds.includes(h.id))
                        .map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => handleSelectHospital(h.id)}
                            className="touch-target px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] shrink-0 flex items-center gap-1.5 text-xs transition-colors"
                          >
                            {savedOrgIds.includes(h.id) && <Star size={11} className="fill-[var(--accent-2)] text-[var(--accent-2)]" />}
                            <span className="font-semibold">{h.name.split(' ')[0]}</span>
                            <span className={`px-1 py-0.2 rounded text-[10px] font-bold tnum ${h.status === 'good' ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]' :
                                h.status === 'mid' ? 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]' :
                                  'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]'
                              }`}>
                              ~{h.selectedDept?.eta?.mid}m
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Hospital Cards List */}
                <div className="flex flex-col gap-3 pt-1">
                  {loading ? (
                    <div className="flex flex-col gap-3">
                      <Skeleton height="120px" />
                      <Skeleton height="120px" />
                      <Skeleton height="120px" />
                    </div>
                  ) : error ? (
                    <ErrorState
                      title="Failed to load live wait times"
                      message={error.message || 'Server connection error.'}
                      onRetry={refresh}
                    />
                  ) : filteredHospitals.length === 0 ? (
                    <EmptyState
                      title="No hospitals match filter"
                      description='Try selecting "All" departments or clear search criteria.'
                      actionText="Reset Filters"
                      onAction={() => { setSelectedDept('All'); setQuery(''); }}
                    />
                  ) : (
                    filteredHospitals.map((h) => (
                      <HospitalCardItem
                        key={h.id}
                        hospital={h}
                        travelMode={travelMode}
                        isSelected={selectedHospitalId === h.id}
                        onSelect={handleSelectHospital}
                        onJoin={(orgId, deptId) => navigate(`/join/${orgId}/${deptId}`)}
                        onToggleSave={toggleSave}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ═════════════════════════════════════════════════════════════
            MOBILE DEDICATED LIST VIEW (When mobileView === 'list')
            ═════════════════════════════════════════════════════════════ */}
        {mobileView === 'list' && (
          <div className="lg:hidden flex-1 flex flex-col h-full min-h-0 overflow-y-auto no-scrollbar p-3.5 pb-24 gap-3 bg-[var(--bg)]">
            {/* Search Input */}
            <div className="relative shrink-0">
              <Search size={16} className="absolute left-3.5 top-3 text-[var(--ink-faint)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hospital or department..."
                aria-label="Search hospitals or departments"
                className="w-full pl-9 pr-9 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-medium focus:border-[var(--brand)] shadow-xs outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-2.5 text-[var(--ink-faint)]"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Department Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
              {ALL_DEPARTMENTS.map((deptName) => {
                const Icon = DEPT_ICONS[deptName] || Stethoscope;
                const active = selectedDept === deptName;
                return (
                  <Chip
                    key={deptName}
                    active={active}
                    icon={<Icon size={13} />}
                    onClick={() => setSelectedDept(deptName)}
                  >
                    {deptName}
                  </Chip>
                );
              })}
            </div>

            {/* Controls: Sort & Travel */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)] shrink-0">
              <Segmented
                value={sortMode}
                onChange={setSortMode}
                options={[
                  { value: 'nearest', label: 'Nearest' },
                  { value: 'fastest', label: 'Fastest' },
                ]}
              />

              <Segmented
                value={travelMode}
                onChange={setTravelMode}
                options={[
                  { value: 'walk', label: '', icon: <Footprints size={14} /> },
                  { value: 'bike', label: '', icon: <Bike size={14} /> },
                  { value: 'car', label: '', icon: <Car size={14} /> },
                ]}
              />
            </div>

            {/* Dedicated Origin Location Bar on Mobile */}
            <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/60 p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-[var(--brand)]/15 text-[var(--brand)] shrink-0">
                    <MapPin size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block">
                        Origin Location
                      </span>
                      {userLocation?.isGPS && (
                        <span className="px-1.5 py-0.2 rounded-md bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] text-[9px] font-bold uppercase">
                          GPS Active
                        </span>
                      )}
                      {userLocation?.isSaved && (
                        <span className="px-1.5 py-0.2 rounded-md bg-[var(--brand)]/15 text-[var(--brand)] text-[9px] font-bold uppercase">
                          Saved Home
                        </span>
                      )}
                      {userLocation?.isDemo && (
                        <span className="px-1.5 py-0.2 rounded-md bg-[var(--surface-2)] text-[var(--ink-muted)] text-[9px] font-bold uppercase">
                          Demo Area
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-[var(--ink)] block truncate">
                      {userLocation?.label || 'Chennai demo area'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLocationMenu(!showLocationMenu)}
                  className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-semibold text-[var(--brand)] hover:border-[var(--brand)] shrink-0 flex items-center gap-1 transition-colors"
                  aria-expanded={showLocationMenu}
                >
                  <span>{showLocationMenu ? 'Close' : 'Change'}</span>
                  {showLocationMenu ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              {/* In-flow Collapsible Location Panel */}
              <AnimatePresence>
                {showLocationMenu && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="overflow-hidden flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]"
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={requestUserLocation}
                        className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] text-left flex items-center gap-2 text-xs font-medium transition-colors"
                      >
                        <LocateFixed size={14} className="text-[var(--brand)] shrink-0" />
                        <span className="truncate">GPS Location</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileView('map');
                          setIsPinMode(true);
                          setShowLocationMenu(false);
                        }}
                        className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] text-left flex items-center gap-2 text-xs font-medium transition-colors"
                      >
                        <Compass size={14} className="text-[var(--brand)] shrink-0" />
                        <span className="truncate">Pin on Map</span>
                      </button>
                    </div>

                    {userLocation?.type === 'pin' && (
                      <button
                        type="button"
                        onClick={() => handleSaveCurrentAsHome()}
                        className="p-1.5 rounded-xl bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-semibold hover:bg-[var(--brand)]/20 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 size={13} />
                        <span>Save Current Pin as Home</span>
                      </button>
                    )}

                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block mb-1">
                        Locations & Presets
                      </span>
                      <div className="flex flex-col gap-1">
                        {LOCATION_PRESETS.map((p) => {
                          const isSelected = userLocation?.id === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                if (p.id === 'saved_home') {
                                  const saved = storage.getSavedHome() || DEFAULT_SAVED_HOME;
                                  setUserLocation(saved);
                                  storage.setLastLocationPreset('saved_home');
                                } else {
                                  setUserLocation(p);
                                  storage.setLastLocationPreset(p.id);
                                }
                                setShowLocationMenu(false);
                              }}
                              className={`p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors ${isSelected
                                  ? 'bg-[var(--surface)] border border-[var(--brand)] font-bold text-[var(--brand)] shadow-xs'
                                  : 'hover:bg-[var(--surface)] border border-transparent font-medium text-[var(--ink)]'
                                }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{p.label}</span>
                                {p.isSaved && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-[var(--brand)]/10 text-[var(--brand)] text-[9px] font-bold uppercase shrink-0">
                                    Saved
                                  </span>
                                )}
                                {p.isDemo && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-[var(--surface-2)] text-[var(--ink-muted)] text-[9px] font-bold uppercase shrink-0">
                                    Demo
                                  </span>
                                )}
                              </div>
                              {isSelected && <CheckCircle2 size={13} className="shrink-0 text-[var(--brand)]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Hospital Cards Single Column */}
            <div className="flex flex-col gap-3">
              {filteredHospitals.map((h) => (
                <HospitalCardItem
                  key={h.id}
                  hospital={h}
                  travelMode={travelMode}
                  isSelected={selectedHospitalId === h.id}
                  onSelect={handleSelectHospital}
                  onJoin={(orgId, deptId) => navigate(`/join/${orgId}/${deptId}`)}
                  onToggleSave={toggleSave}
                />
              ))}
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            MAP CONTAINER (Desktop + Mobile Background)
            ═════════════════════════════════════════════════════════════ */}
        <section className={`flex-1 h-full min-h-0 relative overflow-hidden ${mobileView === 'list' ? 'hidden lg:block' : 'block'}`}>
          <MapView
            markers={filteredHospitals}
            selected={selectedHospitalId}
            onSelect={handleSelectHospital}
            user={userLocation}
            mode="browse"
            isPinMode={isPinMode}
            onPick={handlePinPlaced}
            onCancelPin={() => setIsPinMode(false)}
            sheetSnap={sheetSnap}
            isSidebarCollapsed={isSidebarCollapsed}
          />

          {/* Desktop Floating Hospital Quick Card over Map */}
          {selectedHospital && (
            <div className="hidden lg:flex absolute top-4 left-4 z-20 w-80 bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-[var(--shadow-sheet)] p-4 flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-heading font-extrabold text-sm text-[var(--ink)] truncate">
                      {selectedHospital.name}
                    </h3>
                    {selectedHospital.demo && <Badge variant="demo" size="sm">DEMO</Badge>}
                  </div>
                  <p className="text-[11px] text-[var(--ink-faint)] truncate mt-0.5">{selectedHospital.address}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => toggleSave(selectedHospital.id, selectedHospital.name, e)}
                    className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink-faint)]"
                    aria-label="Save hospital"
                  >
                    <Star size={16} className={selectedHospital.isSaved ? 'fill-[var(--accent-2)] text-[var(--accent-2)]' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHospitalId(null)}
                    className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink-faint)]"
                    aria-label="Close card"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-[var(--surface-2)]">
                  <span className="text-[10px] text-[var(--ink-faint)] block">Wait Estimate</span>
                  <span className="font-bold text-[var(--ink)] tnum">
                    {selectedHospital.selectedDept?.eta?.low}–{selectedHospital.selectedDept?.eta?.high}m
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-[var(--surface-2)]">
                  <span className="text-[10px] text-[var(--ink-faint)] block">
                    {selectedHospital.hasRealDistance ? `Travel (${travelMode})` : 'Location Mode'}
                  </span>
                  <span className="font-bold text-[var(--brand)] tnum">
                    {selectedHospital.hasRealDistance
                      ? `~${selectedHospital.travelMin}m (${selectedHospital.distanceKm} km)`
                      : 'Chennai demo area'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]/60">
                <Link
                  to={`/hospital/${selectedHospital.id}`}
                  className="touch-target flex-1 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-bold text-center text-[var(--ink)] transition-colors"
                >
                  Details
                </Link>
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1"
                  onClick={() => navigate(`/join/${selectedHospital.id}/${selectedHospital.selectedDept?.id || 'gen'}`)}
                >
                  Join Queue
                </Button>
              </div>
            </div>
          )}

          {/* ───────────── Mobile Bottom Sheet ───────────── */}
          <div className="lg:hidden absolute inset-x-0 bottom-0 z-30 pointer-events-none">
            {selectedHospital ? (
              /* Selected Hospital Full Drawer on Mobile */
              <div className="pointer-events-auto bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl shadow-[var(--shadow-sheet)] p-4 max-h-[82dvh] overflow-y-auto pb-24">
                <div
                  className="sheet-handle mb-3 cursor-pointer"
                  onClick={() => setSelectedHospitalId(null)}
                  title="Close details"
                />
                <HospitalSheetDetails
                  hospital={selectedHospital}
                  travelMode={travelMode}
                  onClose={() => setSelectedHospitalId(null)}
                  onJoin={(deptId) => navigate(`/join/${selectedHospital.id}/${deptId}`)}
                  onToggleSave={(id, name) => toggleSave(id, name)}
                />
              </div>
            ) : (
              /* Discovery Results Bottom Sheet with Peek / Half / Full Snap States */
              <div
                className={`
                  pointer-events-auto bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl shadow-[var(--shadow-sheet)]
                  flex flex-col transition-all duration-300 ease-in-out pb-20
                  ${sheetSnap === 'peek' ? 'h-[78px]' : sheetSnap === 'half' ? 'h-[48dvh]' : 'h-[86dvh]'}
                `}
              >
                {/* Drag Handle & Snap Toggle Header */}
                <div
                  className="px-4 pt-2.5 pb-2 shrink-0 cursor-pointer flex flex-col items-center"
                  onClick={() => {
                    setSheetSnap(sheetSnap === 'peek' ? 'half' : sheetSnap === 'half' ? 'full' : 'peek');
                  }}
                >
                  <div className="sheet-handle mb-2" />
                  <div className="w-full flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-extrabold text-xs text-[var(--ink)]">
                        Nearby Hospitals ({filteredHospitals.length})
                      </span>
                      {filteredHospitals[0] && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] tnum">
                          Fastest ~{filteredHospitals[0].selectedDept?.eta?.mid}m
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[var(--ink-faint)]">
                      <span className="text-[11px] font-medium">
                        {sheetSnap === 'peek' ? 'Tap to view' : sheetSnap === 'half' ? 'Full view' : 'Collapse'}
                      </span>
                      {sheetSnap === 'peek' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </div>
                </div>

                {/* Sheet Body (Hidden in peek state, visible in half/full states) */}
                {sheetSnap !== 'peek' && (
                  <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6 flex flex-col gap-3">
                    {/* Horizontal department filter chips inside sheet */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0">
                      {ALL_DEPARTMENTS.map((deptName) => {
                        const Icon = DEPT_ICONS[deptName] || Stethoscope;
                        const active = selectedDept === deptName;
                        return (
                          <Chip
                            key={deptName}
                            active={active}
                            icon={<Icon size={12} />}
                            onClick={() => setSelectedDept(deptName)}
                          >
                            {deptName}
                          </Chip>
                        );
                      })}
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-3">
                      {filteredHospitals.map((h) => (
                        <HospitalCardItem
                          key={h.id}
                          hospital={h}
                          travelMode={travelMode}
                          isSelected={selectedHospitalId === h.id}
                          onSelect={handleSelectHospital}
                          onJoin={(orgId, deptId) => navigate(`/join/${orgId}/${deptId}`)}
                          onToggleSave={toggleSave}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ───────────── Desktop Hospital Side Card Drawer ───────────── */}
          <div className="hidden lg:block">
            <AnimatePresence>
              {selectedHospital && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-4 top-4 bottom-4 w-96 bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-[var(--shadow-card)] p-5 z-30 overflow-y-auto no-scrollbar"
                >
                  <HospitalSheetDetails
                    hospital={selectedHospital}
                    travelMode={travelMode}
                    onClose={() => setSelectedHospitalId(null)}
                    onJoin={(deptId) => navigate(`/join/${selectedHospital.id}/${deptId}`)}
                    onToggleSave={(id, name) => toggleSave(id, name)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ───────────── Mobile Floating Map/List Switcher ───────────── */}
          <div className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
            <button
              type="button"
              onClick={() => {
                const next = mobileView === 'map' ? 'list' : 'map';
                setMobileView(next);
                if (next === 'list') {
                  setSheetSnap('peek');
                }
              }}
              className="touch-target px-5 py-2.5 rounded-full bg-[var(--ink)] text-white font-bold text-xs flex items-center gap-2 shadow-xl active:scale-95 transition-transform"
            >
              {mobileView === 'map' ? (
                <>
                  <List size={15} /> Show List ({filteredHospitals.length})
                </>
              ) : (
                <>
                  <MapIcon size={15} /> Show Map
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ───────────── Compact Emergency Notice Component ─────────────
function CompactEmergencyNotice({ onDismiss, className = "" }) {
  return (
    <div
      role="alert"
      className={`p-3 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 flex items-center justify-between gap-3 text-xs ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <ShieldAlert size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-bold text-[var(--ink)] leading-snug">Medical emergency?</p>
          <p className="text-[11px] text-[var(--ink-faint)] leading-tight truncate">
            Call 112 or visit an emergency department.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href="tel:112"
          className="touch-target px-2.5 py-1.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 font-bold text-xs transition-opacity shadow-xs"
        >
          Call 112
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label="Dismiss emergency notice"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ───────────── Refined Hospital Card Sub-component ─────────────
function HospitalCardItem({
  hospital,
  travelMode,
  isSelected,
  onSelect,
  onJoin,
  onToggleSave,
}) {
  const statusColor =
    hospital.status === 'good'
      ? 'bg-[var(--wait-good)]'
      : hospital.status === 'mid'
        ? 'bg-[var(--wait-mid)]'
        : 'bg-[var(--wait-bad)]';

  const badgeStyle =
    hospital.status === 'good'
      ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]'
      : hospital.status === 'mid'
        ? 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]'
        : 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]';

  return (
    <article
      onClick={() => onSelect(hospital.id)}
      className={`
        p-4 rounded-2xl bg-[var(--surface)] border transition-all cursor-pointer relative shadow-xs hover:shadow-md
        ${isSelected
          ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30 shadow-[var(--shadow-glow)]'
          : 'border-[var(--border)] hover:border-[var(--brand)]/50'}
      `}
    >
      {/* 1. Header Row: Name + DEMO Badge + Star Save Button */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-bold text-sm text-[var(--ink)] truncate">
              {hospital.name}
            </h3>
            {hospital.demo && (
              <Badge variant="demo">DEMO</Badge>
            )}
          </div>
          {/* Location directly beneath */}
          <p className="text-xs text-[var(--ink-faint)] mt-0.5 truncate">
            {hospital.area} · {hospital.address}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => onToggleSave(hospital.id, hospital.name, e)}
          className="touch-target p-1.5 -mr-1 -mt-1 text-[var(--ink-faint)] hover:text-[var(--accent-2)] rounded-lg hover:bg-[var(--surface-2)] transition-colors shrink-0"
          aria-label={hospital.isSaved ? 'Unsave hospital' : 'Save hospital'}
        >
          <Star size={16} className={hospital.isSaved ? 'fill-[var(--accent-2)] text-[var(--accent-2)]' : ''} />
        </button>
      </div>

      {/* 2. Coherent Row: Wait estimate + Department on left, Travel estimate + Distance on right */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2.5 py-1 rounded-xl text-xs font-bold tnum flex items-center gap-1.5 shrink-0 ${badgeStyle}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
            <span>{hospital.selectedDept?.eta?.low}–{hospital.selectedDept?.eta?.high}m wait</span>
          </span>
          <span className="text-[11px] font-medium text-[var(--ink-faint)] truncate">
            {hospital.selectedDept?.name}
          </span>
        </div>

        <div className="text-right tnum shrink-0">
          {hospital.hasRealDistance ? (
            <>
              <span className="text-xs font-semibold text-[var(--brand)] block">
                {hospital.travelLabel}
              </span>
              <span className="text-[10px] text-[var(--ink-faint)] block">
                {hospital.distanceLabel}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold text-[var(--ink-muted)] block">
                Chennai demo area
              </span>
              <span className="text-[10px] text-[var(--brand)] block font-medium">
                GPS needed for distance
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3. Secondary Row: Counters + Confidence */}
      <div className="flex items-center justify-between mt-2.5 text-[11px] text-[var(--ink-faint)]">
        <span className="flex items-center gap-1.5">
          <Users size={12} className="shrink-0" />
          <span>{hospital.selectedDept?.countersOpen}/{hospital.selectedDept?.countersTotal} counters open</span>
        </span>
        <span className="truncate max-w-[150px] text-[10px] opacity-80">
          {hospital.selectedDept?.confidence}
        </span>
      </div>

      {/* 4. Action Row: Details & Join Queue consistently aligned */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-[var(--border)]/60">
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(hospital.id);
          }}
        >
          Details
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation();
            onJoin(hospital.id, hospital.selectedDept?.id || 'gen');
          }}
        >
          Join Queue
        </Button>
      </div>
    </article>
  );
}

// ───────────── Hospital Detail Sub-component ─────────────
function HospitalSheetDetails({ hospital, travelMode, onClose, onJoin, onToggleSave }) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lng}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-extrabold text-base text-[var(--ink)]">{hospital.name}</h2>
            {hospital.demo && (
              <Badge variant="demo">DEMO</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--ink-faint)] mt-0.5">{hospital.address}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleSave(hospital.id, hospital.name)}
            className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] text-[var(--ink-faint)]"
            aria-label="Save hospital"
          >
            <Star size={18} className={hospital.isSaved ? 'fill-[var(--accent-2)] text-[var(--accent-2)]' : ''} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] text-[var(--ink-faint)]"
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Travel & Hours Info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-2xl bg-[var(--surface-2)]">
          <span className="text-[10px] text-[var(--ink-faint)] block">
            {hospital.hasRealDistance ? 'Estimated Travel' : 'Location Mode'}
          </span>
          <span className="font-bold text-[var(--brand)] tnum">
            {hospital.hasRealDistance
              ? `${hospital.travelLabel} · ${hospital.distanceLabel}`
              : 'Chennai demo area · Tap GPS for live distance'}
          </span>
        </div>
        <div className="p-2.5 rounded-2xl bg-[var(--surface-2)]">
          <span className="text-[10px] text-[var(--ink-faint)] block">Hours</span>
          <span className="font-bold text-[var(--ink)]">{hospital.hours}</span>
        </div>
      </div>

      {/* Departments Live Queues */}
      <div>
        <h4 className="text-xs font-bold text-[var(--ink-faint)] uppercase tracking-wider mb-2">
          Departments & Live Wait
        </h4>
        <div className="flex flex-col gap-2">
          {hospital.departments.map((dept) => {
            const status = waitStatus(dept.eta.mid);
            return (
              <div
                key={dept.id}
                className="p-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-xs text-[var(--ink)] block">{dept.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tnum ${status === 'good' ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]' :
                        status === 'mid' ? 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]' :
                          'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]'
                      }`}>
                      {dept.eta.low}–{dept.eta.high} min
                    </span>
                    <span className="text-[10px] text-[var(--ink-faint)]">
                      {dept.countersOpen}/{dept.countersTotal} open
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onJoin(dept.id)}
                >
                  Join
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <Link
          to={`/hospital/${hospital.id}`}
          className="touch-target w-full py-2.5 rounded-2xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-bold flex items-center justify-center gap-2 text-[var(--brand)] transition-colors"
        >
          View Full Hospital Page
        </Link>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="touch-target w-full py-2.5 rounded-2xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-bold flex items-center justify-center gap-2 text-[var(--ink)] transition-colors"
        >
          <CornerUpRight size={15} /> Directions in Maps
        </a>
      </div>
    </div>
  );
}


