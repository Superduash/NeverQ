import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Navigation, Zap, Footprints, Bike, Car,
  List, Map as MapIcon, X, LocateFixed, Star, PhoneCall,
  Clock, Users, ExternalLink, ShieldAlert, Sparkles, RefreshCw,
  Compass, Eye, HeartPulse, Stethoscope, Pill, Bone, Layers,
  CheckCircle2, ArrowRight, CornerUpRight
} from 'lucide-react';
import {
  WAIT_THRESHOLDS, DEMO_HOME, LOCATION_PRESETS, ALL_DEPARTMENTS,
  haversine, estimateTravel, waitStatus, storage, mockApi
} from '../lib/mock.js';
import { Logo, ThemeToggle, useTheme, useLiveData, api } from '../main.jsx';

const DEFAULT_MAP_STYLE = import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty';

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
  const [userLocation, setUserLocation] = useState(DEMO_HOME);
  const [isPinMode, setIsPinMode] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [savedOrgIds, setSavedOrgIds] = useState(() => storage.getSavedOrgs());
  const [recentOrgIds, setRecentOrgIds] = useState(() => storage.getRecentOrgs());
  const [activeTicket, setActiveTicket] = useState(() => storage.getActiveTicket());
  const [emergencyDismissed, setEmergencyDismissed] = useState(() => sessionStorage.getItem('nq-dismiss-emergency') === 'true');
  const [mobileView, setMobileView] = useState('map'); // 'map' | 'list'
  const [sheetSnap, setSheetSnap] = useState('peek'); // 'peek' | 'half' | 'full'
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Live query fetcher
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
    room: 'queues',
    event: 'queue:update',
    interval: 10000,
  });

  // Online / offline listeners
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); toast.success('Back online'); };
    const onOffline = () => { setIsOnline(false); toast.error('You are offline. Showing cached wait times.'); };
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

    return rawHospitals.map((h) => {
      const travel = estimateTravel(origin, { lat: h.lat, lng: h.lng }, travelMode);
      const deptObj =
        selectedDept === 'All'
          ? h.departments.find((d) => d.name === 'General OPD') || h.departments[0]
          : h.departments.find((d) => d.name === selectedDept) || h.departments[0];

      const waitMid = deptObj?.eta?.mid || 15;
      const totalTime = travel.minutes + waitMid;

      return {
        ...h,
        selectedDept: deptObj,
        distanceKm: travel.km,
        travelMin: travel.minutes,
        totalMin: totalTime,
        status: waitStatus(waitMid),
        isSaved: savedOrgIds.includes(h.id),
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
      const matchArea = h.area.toLowerCase().includes(q);
      const matchDepts = h.departments.some((d) => d.name.toLowerCase().includes(q));
      return matchName || matchArea || matchDepts;
    });
  }, [enrichedHospitals, query]);

  // Selected hospital details
  const selectedHospital = useMemo(() => {
    return enrichedHospitals.find((h) => h.id === selectedHospitalId) || null;
  }, [enrichedHospitals, selectedHospitalId]);

  // Handle saving org
  const toggleSave = (id, name, e) => {
    e?.stopPropagation();
    const next = storage.toggleSavedOrg(id);
    setSavedOrgIds(next);
    if (next.includes(id)) {
      toast.success(`Saved ${name}`);
    } else {
      toast.info(`Removed ${name} from saved`);
    }
  };

  // Select hospital handler
  const handleSelectHospital = (id) => {
    setSelectedHospitalId(id);
    const updatedRecent = storage.addRecentOrg(id);
    setRecentOrgIds(updatedRecent);
    setSheetSnap('half');
  };

  // Location handler: Geolocation
  const requestUserLocation = () => {
    setShowLocationMenu(false);
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setShowLocationMenu(true);
      return;
    }
    toast.info('Requesting current location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          id: 'gps',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Your Current Location',
        });
        toast.success('Location updated');
      },
      (err) => {
        toast.error('Could not get GPS location. Select a preset below.');
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

  return (
    <div className="flex-1 flex flex-col h-full min-h-[100dvh] relative overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* ───────────── Emergency Strip ───────────── */}
      {!emergencyDismissed && (
        <aside
          aria-label="Medical emergency notice"
          className="bg-[var(--accent)] text-white px-4 py-2 flex items-center justify-between text-xs font-semibold z-50 select-none shadow-sm"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0 animate-pulse" />
            <span>Medical emergency? Call 112 or visit an emergency room immediately.</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="tel:112"
              className="touch-target px-2.5 py-1 rounded bg-white text-[var(--accent)] hover:bg-white/90 font-bold transition-transform active:scale-95"
            >
              Call 112
            </a>
            <button
              type="button"
              onClick={() => {
                setEmergencyDismissed(true);
                sessionStorage.setItem('nq-dismiss-emergency', 'true');
              }}
              className="p-1 hover:bg-black/10 rounded"
              aria-label="Dismiss emergency notice"
            >
              <X size={14} />
            </button>
          </div>
        </aside>
      )}

      {/* ───────────── Header / Top Bar ───────────── */}
      <header className="sticky top-0 z-40 bg-[var(--surface-glass)] backdrop-blur-md border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo size={30} />
          {/* Live indicator dot */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-2)] text-[var(--ink-faint)]">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`} />
            <span className="hidden sm:inline">{isOnline ? 'Live' : 'Offline'}</span>
            <span className="text-[10px] opacity-70 tnum">({lastUpdatedTime})</span>
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
              <span>Ticket #{activeTicket.token}</span>
            </Link>
          )}

          <Link
            to="/staff/login"
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-[var(--ink-faint)] hover:text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Staff
          </Link>

          <ThemeToggle />
        </div>
      </header>

      {/* ───────────── Pin Placement Mode Bar ───────────── */}
      {isPinMode && (
        <div className="bg-[var(--accent)] text-white px-4 py-2 flex items-center justify-between text-xs font-bold z-40">
          <span>Tap anywhere on the map to place your location pin.</span>
          <button
            type="button"
            onClick={() => setIsPinMode(false)}
            className="px-2 py-1 bg-white text-[var(--accent)] rounded font-bold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ───────────── Main Content: Desktop Split / Mobile View ───────────── */}
      <div className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        {/* LEFT PANEL: Controls & Hospital List (Desktop 420px, Mobile Sheet / List View) */}
        <section
          className={`
            lg:w-[420px] lg:border-r border-[var(--border)] bg-[var(--bg)] flex flex-col z-30
            ${mobileView === 'list' ? 'flex flex-1 overflow-y-auto' : 'hidden lg:flex overflow-y-auto'}
          `}
        >
          <div className="p-4 flex flex-col gap-3">
            {/* Search Bar with Autocomplete Match */}
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-3.5 text-[var(--ink-faint)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search hospital or department..."
                aria-label="Search hospitals or departments"
                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm font-medium focus:border-[var(--brand)] shadow-sm outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-3 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Department Chips */}
            <div className="relative">
              <div
                className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
                role="tablist"
                aria-label="Department filters"
              >
                {ALL_DEPARTMENTS.map((deptName) => {
                  const Icon = DEPT_ICONS[deptName] || Stethoscope;
                  const active = selectedDept === deptName;
                  return (
                    <button
                      key={deptName}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedDept(deptName)}
                      className={`
                        touch-target px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-all
                        ${active
                          ? 'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-[var(--shadow-glow)]'
                          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] hover:border-[var(--brand)]'}
                      `}
                    >
                      <Icon size={14} />
                      <span>{deptName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Controls: Sort, Travel Mode, Location Picker */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)]">
              {/* Sort Mode Segmented */}
              <div className="flex rounded-xl bg-[var(--surface-2)] p-0.5 border border-[var(--border)] text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setSortMode('nearest')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${sortMode === 'nearest' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs font-bold' : 'text-[var(--ink-faint)]'}`}
                >
                  Nearest
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('fastest')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${sortMode === 'fastest' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs font-bold' : 'text-[var(--ink-faint)]'}`}
                >
                  Fastest
                </button>
              </div>

              {/* Travel Mode Segmented */}
              <div className="flex rounded-xl bg-[var(--surface-2)] p-0.5 border border-[var(--border)] text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setTravelMode('walk')}
                  className={`p-1.5 rounded-lg ${travelMode === 'walk' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs' : 'text-[var(--ink-faint)]'}`}
                  title="Walking (~4.5 km/h approx.)"
                  aria-label="Walk mode"
                >
                  <Footprints size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('bike')}
                  className={`p-1.5 rounded-lg ${travelMode === 'bike' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs' : 'text-[var(--ink-faint)]'}`}
                  title="Bicycle (~14 km/h approx.)"
                  aria-label="Bike mode"
                >
                  <Bike size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('car')}
                  className={`p-1.5 rounded-lg ${travelMode === 'car' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-xs' : 'text-[var(--ink-faint)]'}`}
                  title="Car (~22 km/h approx.)"
                  aria-label="Car mode"
                >
                  <Car size={15} />
                </button>
              </div>

              {/* Location Selector Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLocationMenu(!showLocationMenu)}
                  className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-medium flex items-center gap-1.5 hover:border-[var(--brand)]"
                  aria-expanded={showLocationMenu}
                  aria-haspopup="true"
                >
                  <MapPin size={13} className="text-[var(--brand)]" />
                  <span className="truncate max-w-[120px]">{userLocation?.label || 'Select Origin'}</span>
                </button>

                {showLocationMenu && (
                  <div className="absolute right-0 top-8 mt-1 w-60 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] p-2 z-50 flex flex-col gap-1 text-xs">
                    <button
                      type="button"
                      onClick={requestUserLocation}
                      className="p-2 text-left rounded-xl hover:bg-[var(--surface-2)] flex items-center gap-2 font-medium"
                    >
                      <LocateFixed size={14} className="text-[var(--brand)]" />
                      Use GPS Location
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPinMode(true);
                        setShowLocationMenu(false);
                      }}
                      className="p-2 text-left rounded-xl hover:bg-[var(--surface-2)] flex items-center gap-2 font-medium"
                    >
                      <Compass size={14} className="text-[var(--brand)]" />
                      Choose pin on map
                    </button>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <span className="px-2 py-0.5 text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                      Presets
                    </span>
                    {LOCATION_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setUserLocation(p);
                          setShowLocationMenu(false);
                          storage.setLastLocationPreset(p.id);
                        }}
                        className={`p-2 text-left rounded-xl hover:bg-[var(--surface-2)] flex items-center justify-between ${userLocation?.id === p.id ? 'font-bold text-[var(--brand)]' : ''}`}
                      >
                        <span>{p.label}</span>
                        {userLocation?.id === p.id && <CheckCircle2 size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Saved & Recent Horizontal Row */}
            {(savedOrgIds.length > 0 || recentOrgIds.length > 0) && (
              <div className="pt-2 border-t border-[var(--border)]">
                <span className="text-[11px] font-bold text-[var(--ink-faint)] uppercase tracking-wider block mb-1.5">
                  Saved & Recent
                </span>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {enrichedHospitals
                    .filter((h) => savedOrgIds.includes(h.id) || recentOrgIds.includes(h.id))
                    .map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => handleSelectHospital(h.id)}
                        className="touch-target px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] shrink-0 flex items-center gap-2 text-xs"
                      >
                        {savedOrgIds.includes(h.id) && <Star size={12} className="fill-[var(--accent-2)] text-[var(--accent-2)]" />}
                        <span className="font-semibold">{h.name.split(' ')[0]}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tnum ${
                          h.status === 'good' ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]' :
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
          </div>

          {/* Hospital List Items */}
          <div className="flex-1 px-4 pb-6 flex flex-col gap-3">
            {loading ? (
              <div className="flex flex-col gap-3">
                <div className="shimmer-box h-32 rounded-3xl" />
                <div className="shimmer-box h-32 rounded-3xl" />
                <div className="shimmer-box h-32 rounded-3xl" />
              </div>
            ) : error ? (
              <div className="p-6 text-center rounded-2xl bg-[var(--surface)] border border-[var(--danger)]">
                <p className="text-sm font-semibold mb-3">Failed to load live wait times.</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : filteredHospitals.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm">
                <p className="font-semibold text-[var(--ink)] mb-1">No hospitals match your filter.</p>
                <p className="text-xs text-[var(--ink-faint)] mb-4">Try selecting "All" departments or clear search.</p>
                <button
                  type="button"
                  onClick={() => { setSelectedDept('All'); setQuery(''); }}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-white text-xs font-semibold"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredHospitals.map((h) => {
                const isSelected = selectedHospitalId === h.id;
                return (
                  <article
                    key={h.id}
                    onClick={() => handleSelectHospital(h.id)}
                    className={`
                      p-4 rounded-3xl bg-[var(--surface)] border transition-all cursor-pointer relative shadow-sm
                      ${isSelected ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30 shadow-[var(--shadow-glow)]' : 'border-[var(--border)] hover:border-[var(--brand)]/50'}
                    `}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading font-bold text-sm text-[var(--ink)]">{h.name}</h3>
                          {h.demo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-2)]/20 text-[var(--accent-2)]">
                              DEMO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--ink-faint)]">{h.area} · {h.address}</p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => toggleSave(h.id, h.name, e)}
                        className="touch-target p-1 text-[var(--ink-faint)] hover:text-[var(--accent-2)]"
                        aria-label={h.isSaved ? 'Unsave hospital' : 'Save hospital'}
                      >
                        <Star size={16} className={h.isSaved ? 'fill-[var(--accent-2)] text-[var(--accent-2)]' : ''} />
                      </button>
                    </div>

                    {/* Wait badge & ETA */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold tnum flex items-center gap-1.5 ${
                          h.status === 'good' ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]' :
                          h.status === 'mid' ? 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]' :
                          'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${h.status === 'good' ? 'bg-[var(--wait-good)]' : h.status === 'mid' ? 'bg-[var(--wait-mid)]' : 'bg-[var(--wait-bad)]'}`} />
                          {h.selectedDept?.eta?.low}–{h.selectedDept?.eta?.high} min wait
                        </span>
                        <span className="text-[11px] text-[var(--ink-faint)] font-medium">
                          {h.selectedDept?.name}
                        </span>
                      </div>

                      <div className="text-right tnum">
                        <span className="text-xs font-semibold text-[var(--brand)]">
                          ~{h.travelMin} min {travelMode} (approx.)
                        </span>
                        <span className="text-[10px] text-[var(--ink-faint)] block">
                          {h.distanceKm} km away
                        </span>
                      </div>
                    </div>

                    {/* Stats & Confidence */}
                    <div className="flex items-center justify-between mt-2.5 text-[11px] text-[var(--ink-faint)]">
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {h.selectedDept?.countersOpen}/{h.selectedDept?.countersTotal} counters open
                      </span>
                      <span className="truncate max-w-[180px]">{h.selectedDept?.confidence}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSelectHospital(h.id); }}
                        className="touch-target px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--ink)]"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/join/${h.id}/${h.selectedDept?.id || 'gen'}`);
                        }}
                        className="touch-target px-4 py-1.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-xs font-bold shadow-[var(--shadow-glow)] hover:opacity-95"
                      >
                        Join Queue
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT PANEL: MapLibre Map Container */}
        <section className={`flex-1 relative ${mobileView === 'list' ? 'hidden lg:block' : 'block h-full'}`}>
          <MapComponent
            hospitals={enrichedHospitals}
            selectedId={selectedHospitalId}
            onSelectHospital={handleSelectHospital}
            userLocation={userLocation}
            isPinMode={isPinMode}
            onPinPlaced={(coords) => {
              setUserLocation({
                id: 'custom',
                lat: coords.lat,
                lng: coords.lng,
                label: 'Custom Pin on Map',
              });
              setIsPinMode(false);
              toast.success('Origin set to map pin');
            }}
            mapStyle={DEFAULT_MAP_STYLE}
            resolvedTheme={resolvedTheme}
          />

          {/* Mobile Bottom Sheet (Draggable preview of selected hospital or list) */}
          <div className="lg:hidden absolute inset-x-0 bottom-0 z-30 pointer-events-none">
            {selectedHospital && (
              <div className="pointer-events-auto bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl shadow-[var(--shadow-sheet)] p-4 max-h-[75vh] overflow-y-auto">
                <div className="sheet-handle mb-3" />
                <HospitalSheetDetails
                  hospital={selectedHospital}
                  travelMode={travelMode}
                  onClose={() => setSelectedHospitalId(null)}
                  onJoin={(deptId) => navigate(`/join/${selectedHospital.id}/${deptId}`)}
                  onToggleSave={(id, name) => toggleSave(id, name)}
                />
              </div>
            )}
          </div>

          {/* Desktop Hospital Side Card Drawer */}
          <div className="hidden lg:block">
            <AnimatePresence>
              {selectedHospital && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-4 top-4 bottom-4 w-96 bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-[var(--shadow-card)] p-5 z-30 overflow-y-auto"
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

          {/* Mobile Floating Map/List Switcher */}
          <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
            <button
              type="button"
              onClick={() => setMobileView(mobileView === 'map' ? 'list' : 'map')}
              className="touch-target px-5 py-2.5 rounded-full bg-[var(--ink)] text-white font-bold text-xs flex items-center gap-2 shadow-xl active:scale-95 transition-transform"
            >
              {mobileView === 'map' ? (
                <>
                  <List size={16} /> Show List ({filteredHospitals.length})
                </>
              ) : (
                <>
                  <MapIcon size={16} /> Show Map
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-2)]/20 text-[var(--accent-2)]">
                DEMO
              </span>
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
          <span className="text-[10px] text-[var(--ink-faint)] block">Estimated Travel</span>
          <span className="font-bold text-[var(--brand)] tnum">
            ~{hospital.travelMin} min ({hospital.distanceKm} km approx.)
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
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tnum ${
                      status === 'good' ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]' :
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

                <button
                  type="button"
                  onClick={() => onJoin(dept.id)}
                  className="touch-target px-3.5 py-1.5 rounded-xl bg-[var(--brand)] text-white text-xs font-bold hover:opacity-90 shadow-xs"
                >
                  Join
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Directions action */}
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="touch-target w-full py-2.5 rounded-2xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-bold flex items-center justify-center gap-2 text-[var(--ink)]"
      >
        <CornerUpRight size={15} /> Directions in Maps
      </a>
    </div>
  );
}

// ───────────── MapLibre Component with Cleanup & Handlers ─────────────
function MapComponent({
  hospitals,
  selectedId,
  onSelectHospital,
  userLocation,
  isPinMode,
  onPinPlaced,
  mapStyle,
  resolvedTheme,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current) return;

    let mapInstance;
    try {
      mapInstance = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyle,
        center: [DEMO_HOME.lng, DEMO_HOME.lat],
        zoom: 12,
        attributionControl: false,
      });

      mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      mapInstance.on('click', (e) => {
        if (isPinMode && onPinPlaced) {
          onPinPlaced({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        }
      });

      mapInstance.on('error', (err) => {
        console.warn('MapLibre error handled:', err);
      });

      mapRef.current = mapInstance;
    } catch (err) {
      console.error('Failed to initialize map:', err);
      toast.error('Could not render interactive map. Showing list view.');
    }

    // ResizeObserver ensures no blank map
    const ro = new ResizeObserver(() => {
      mapInstance?.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      userMarkerRef.current?.remove();
      mapInstance?.remove();
      mapRef.current = null;
    };
  }, [mapStyle]);

  // Click on map when pin mode is toggled
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = isPinMode ? 'crosshair' : '';
  }, [isPinMode]);

  // Update Hospital Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = markersRef.current;
    const activeIds = new Set(hospitals.map((h) => h.id));

    // Remove old markers
    currentMarkers.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        currentMarkers.delete(id);
      }
    });

    // Add or update markers
    hospitals.forEach((h) => {
      let markerObj = currentMarkers.get(h.id);

      if (!markerObj) {
        const el = document.createElement('div');
        el.className = 'nq-marker-pill';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectHospital(h.id);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([h.lng, h.lat])
          .addTo(map);

        markerObj = { marker, el };
        currentMarkers.set(h.id, markerObj);
      }

      // Update content & classes
      const isSelected = h.id === selectedId;
      markerObj.el.className = `nq-marker-pill ${isSelected ? 'selected' : ''}`;
      markerObj.el.style.backgroundColor =
        h.status === 'good' ? 'var(--wait-good)' :
        h.status === 'mid' ? 'var(--wait-mid)' :
        'var(--wait-bad)';
      markerObj.el.style.color = '#ffffff';

      markerObj.el.innerHTML = `
        <span>~${h.selectedDept?.eta?.mid || 15}m</span>
      `;
    });
  }, [hospitals, selectedId, onSelectHospital]);

  // Update User Location Dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'nq-user-dot';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[350px] relative"
      aria-label="Interactive hospital map"
    />
  );
}
