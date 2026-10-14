import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Sliders, RotateCcw, FastForward, Play,
  Plus, Check, X, ShieldAlert, Clock, MapPin, Zap, Activity,
  QrCode, Copy, CheckCircle2, ChevronRight, Edit3, Power,
  ExternalLink, BarChart3, ListFilter, AlertCircle
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLiveData } from '../lib/socket.js';
import { notify } from '../lib/notify.js';
import {
  Button, IconButton, Badge, Segmented, ConfirmDialog,
  Skeleton, EmptyState
} from '../components/ui/index.js';
import { MapView } from '../components/map/index.js';

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'hospitals' | 'director'

  // Summary and Orgs data
  const [summary, setSummary] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hospital creation/editing modal state
  const [editingOrg, setEditingOrg] = useState(null);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [confirmToggleOrg, setConfirmToggleOrg] = useState(null);

  // Demo Director states
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [directorOrgId, setDirectorOrgId] = useState('');
  const [directorDeptId, setDirectorDeptId] = useState('');
  const [simDept, setSimDept] = useState('gen');
  const [simCount, setSimCount] = useState(6);
  const [customFfMins, setCustomFfMins] = useState(15);
  const [customClockOffset, setCustomClockOffset] = useState(0);
  const [currentRush, setCurrentRush] = useState(1);
  const [activityLogs, setActivityLogs] = useState([]);

  // Demo Checklist state (persisted locally)
  const [checklist, setChecklist] = useState(() => {
    try {
      const saved = localStorage.getItem('nq-demo-checklist');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const loadAllData = useCallback(async () => {
    try {
      const [sumRes, orgsRes] = await Promise.all([
        api.getAdminSummary(),
        api.listOrgs(),
      ]);
      setSummary(sumRes);
      setHospitals(orgsRes);
      if (sumRes?.rushFactor) setCurrentRush(sumRes.rushFactor);
    } catch (err) {
      console.warn('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Log an activity in the Demo Director session log
  const logAction = (title, detail) => {
    setActivityLogs((prev) => [
      { id: Date.now(), time: new Date().toLocaleTimeString(), title, detail },
      ...prev.slice(0, 19),
    ]);
  };

  // ───────────── Demo Director Actions (Phase 9) ─────────────
  const handleReset = async () => {
    setResetting(true);
    try {
      await api.demoReset();
      notify.success('All queues and simulation states have been reset');
      logAction('Demo Reset', 'Reset DB to initial seed with empty queues');
      setShowResetConfirm(false);
      loadAllData();
    } catch (err) {
      notify.error(err);
    } finally {
      setResetting(false);
    }
  };

  // Active director org and dept derived dynamically
  const activeDirectorOrg = useMemo(() => {
    return hospitals.find((h) => h.id === directorOrgId) || hospitals.at(0) || null;
  }, [hospitals, directorOrgId]);

  const activeDirectorDept = useMemo(() => {
    return activeDirectorOrg?.departments?.find((d) => d.id === directorDeptId) || activeDirectorOrg?.departments?.[0] || null;
  }, [activeDirectorOrg, directorDeptId]);

  const handleSimulate = async () => {
    try {
      if (!activeDirectorOrg) { notify.error('No hospitals loaded yet'); return; }
      const deptId = activeDirectorDept?.id || 'gen';
      await api.simulatePatients({
        orgId: activeDirectorOrg.id,
        deptId,
        count: simCount,
      });
      notify.success(`Simulated ${simCount} patients in department`);
      logAction('Simulate Patients', `Added ${simCount} simulated tickets in ${activeDirectorOrg.name}`);
      loadAllData();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleFastForward = async (minutes) => {
    try {
      const res = await api.demoFastForward({ minutes });
      notify.info(`Fast-forwarded clock by +${minutes} min (Total offset: ${res.offsetMinutes}m)`);
      logAction('Fast Forward', `Advanced demo clock by ${minutes} minutes`);
      loadAllData();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleSetClock = async (offsetMinutes) => {
    try {
      const res = await api.demoSetClock({ offsetMinutes });
      notify.info(`Demo clock offset set to ${res.offsetMinutes}m`);
      logAction('Set Clock', `Set clock offset directly to ${res.offsetMinutes} minutes`);
      loadAllData();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleRushHour = async (factor) => {
    try {
      await api.demoRushHour({ factor });
      setCurrentRush(factor);
      notify.info(`Rush hour traffic factor set to ×${factor}`);
      logAction('Rush Hour Changed', `Travel times multiplied by ×${factor}`);
    } catch (err) {
      notify.error(err);
    }
  };

  // Scenario Presets (Phase 9.5 & D-4: admin dedicated endpoint)
  const runScenario = async (type) => {
    try {
      if (!activeDirectorOrg) { notify.error('Load hospitals first'); return; }
      const orgId = activeDirectorOrg.id;
      const deptId = activeDirectorDept?.id || 'gen';
      const scenarioType = type === 'open-c2' ? 'open-counter' : type;

      await api.demoScenario({ type: scenarioType, orgId, deptId });
      notify.success(`Scenario executed: ${type}`);
      logAction(`Scenario: ${type}`, `Triggered ${type} on ${activeDirectorOrg.name}`);
      loadAllData();
    } catch (err) {
      notify.error(err);
    }
  };

  const toggleChecklistItem = (id) => {
    const updated = { ...checklist, [id]: !checklist[id] };
    setChecklist(updated);
    try {
      localStorage.setItem('nq-demo-checklist', JSON.stringify(updated));
    } catch {}
  };

  const copyOriginLink = () => {
    navigator.clipboard?.writeText(window.location.origin);
    notify.success('Copied app URL to clipboard');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)] text-[var(--ink)]">
      {/* ───────────── Admin Sub-Navbar ───────────── */}
      <div className="shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <Segmented
            size="sm"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'summary', label: 'Platform Summary', icon: <BarChart3 size={13} /> },
              { value: 'hospitals', label: `Hospitals (${hospitals.length})`, icon: <Building2 size={13} /> },
              { value: 'director', label: 'Demo Director', icon: <Sliders size={13} /> },
            ]}
          />
        </div>

        {activeTab === 'hospitals' && (
          <Button
            size="sm"
            variant="primary"
            iconLeft={<Plus size={14} />}
            onClick={() => {
              setEditingOrg(null);
              setShowOrgModal(true);
            }}
          >
            Create Hospital
          </Button>
        )}
      </div>

      {/* ───────────── Main Content Views ───────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-5xl mx-auto w-full flex flex-col gap-6 pb-24">
        {/* ═════════════════════════════════════════════════════════════
            PHASE 8.5: PLATFORM SUMMARY VIEW
            ═════════════════════════════════════════════════════════════ */}
        {activeTab === 'summary' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Facilities</span>
                <span className="font-heading font-black text-2xl text-[var(--ink)] mt-1 tnum">
                  {summary?.totalHospitals || hospitals.length}
                </span>
                <span className="text-[11px] text-[var(--ink-faint)] mt-0.5">Active clinics</span>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Consultation Desks</span>
                <span className="font-heading font-black text-2xl text-[var(--brand)] mt-1 tnum">
                  {/* F-25: show real count, never invent 6 */}
                  {summary?.totalCounters ?? (hospitals.reduce((acc, h) => acc + (h.departments?.reduce((da, d) => da + (d.counters?.length || 0), 0) || 0), 0))}
                </span>
                <span className="text-[11px] text-[var(--ink-faint)] mt-0.5">Counters online</span>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Current Queue Load</span>
                <span className="font-heading font-black text-2xl text-[var(--wait-mid)] mt-1 tnum">
                  {summary?.activeTickets || 0}
                </span>
                <span className="text-[11px] text-[var(--ink-faint)] mt-0.5">Patients waiting</span>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Traffic Factor</span>
                <span className="font-heading font-black text-2xl text-[var(--ink)] mt-1 tnum">
                  ×{summary?.rushFactor || currentRush}
                </span>
                <span className="text-[11px] text-[var(--ink-faint)] mt-0.5">Travel scaling</span>
              </div>
            </div>

            {/* Per-Department Average Durations (Plain SVG Bars) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                  Average Consultation Duration by Department (Plain SVG)
                </h3>
                <span className="text-xs font-semibold text-[var(--ink-faint)]">Aggregates only</span>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                {[
                  { name: 'General OPD', min: 12.5, target: 12, max: 25 },
                  { name: 'Eye Clinic / Optometry', min: 21.0, target: 20, max: 25 },
                  { name: 'Dispensing Pharmacy', min: 4.8, target: 5, max: 25 },
                ].map((dept) => {
                  const pct = Math.min(100, (dept.min / dept.max) * 100);
                  return (
                    <div key={dept.name} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[var(--ink)]">{dept.name}</span>
                        <span className="font-extrabold text-[var(--brand)] tnum">
                          {dept.min} min (target ~{dept.target}m)
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-[var(--brand)] transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            PHASE 8.2: HOSPITAL LIST VIEW
            ═════════════════════════════════════════════════════════════ */}
        {activeTab === 'hospitals' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {hospitals.map((hospital) => {
                const totalCounters = hospital.departments?.reduce((acc, d) => acc + (d.countersTotal || d.counters?.length || 0), 0) || 0;
                const isOpen = hospital.open !== false;

                return (
                  <div
                    key={hospital.id}
                    className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between gap-4 hover:border-[var(--brand)]/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
                            {hospital.name}
                          </h3>
                          {hospital.demo && <Badge variant="demo">DEMO</Badge>}
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          isOpen
                            ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]'
                            : 'bg-[var(--surface-2)] text-[var(--ink-faint)]'
                        }`}>
                          {isOpen ? 'Open' : 'Closed'}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--ink-faint)]">
                        {hospital.address || hospital.area || 'Chennai, India'}
                      </p>

                      <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-xl bg-[var(--surface-2)] text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[var(--ink-faint)] block">Departments</span>
                          <span className="font-bold text-[var(--ink)] tnum">{hospital.departments?.length || 0} units</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[var(--ink-faint)] block">Total Desks</span>
                          <span className="font-bold text-[var(--ink)] tnum">{totalCounters} counters</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                      <Button
                        size="xs"
                        variant="ghost"
                        iconLeft={<Edit3 size={13} />}
                        onClick={() => {
                          setEditingOrg(hospital);
                          setShowOrgModal(true);
                        }}
                      >
                        Edit Details
                      </Button>

                      <Button
                        size="xs"
                        variant={isOpen ? 'ghost' : 'primary'}
                        iconLeft={<Power size={13} />}
                        onClick={() => setConfirmToggleOrg(hospital)}
                      >
                        {isOpen ? 'Close Facility' : 'Re-open'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════
            PHASE 9: DEMO DIRECTOR VIEW
            ═════════════════════════════════════════════════════════════ */}
        {activeTab === 'director' && (
          <div className="flex flex-col gap-6">
            {/* Top Toolbar: Reset, Fast Forward, Rush Hour */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-[var(--brand)]" />
                  <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                    Realtime Simulation Controls
                  </h3>
                </div>

                {/* Org & Dept Selectors */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--ink-faint)]">Facility:</span>
                    <select
                      value={directorOrgId || activeDirectorOrg?.id || ''}
                      onChange={(e) => {
                        setDirectorOrgId(e.target.value);
                        const org = hospitals.find((h) => h.id === e.target.value);
                        if (org?.departments?.[0]) setDirectorDeptId(org.departments[0].id);
                      }}
                      className="h-8 px-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                    >
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--ink-faint)]">Dept:</span>
                    <select
                      value={directorDeptId || activeDirectorDept?.id || ''}
                      onChange={(e) => setDirectorDeptId(e.target.value)}
                      className="h-8 px-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                    >
                      {(activeDirectorOrg?.departments || []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 9.1 Reset Button */}
                  <Button
                    size="sm"
                    variant="danger"
                    iconLeft={<RotateCcw size={14} />}
                    onClick={() => setShowResetConfirm(true)}
                    loading={resetting}
                  >
                    Reset Demo DB
                  </Button>
                </div>
              </div>

              {/* 9.3 Fast Forward Clock Controls & Absolute Set Clock */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                  <Clock size={14} className="text-[var(--brand)]" />
                  <span>Fast-Forward Simulated Clock</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {[5, 15, 30].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="ghost"
                      onClick={() => handleFastForward(m)}
                    >
                      +{m} min
                    </Button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={customFfMins}
                      onChange={(e) => setCustomFfMins(Number(e.target.value))}
                      className="w-16 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-center font-bold tnum text-[var(--ink)]"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleFastForward(customFfMins)}
                    >
                      Advance
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border)]">
                    <span className="text-xs text-[var(--ink-faint)]">Set offset:</span>
                    <input
                      type="number"
                      value={customClockOffset}
                      onChange={(e) => setCustomClockOffset(Number(e.target.value))}
                      placeholder="0"
                      className="w-16 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-center font-bold tnum text-[var(--ink)]"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetClock(customClockOffset)}
                    >
                      Set Clock
                    </Button>
                  </div>
                </div>
              </div>

              {/* 9.4 Rush Hour Switch */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  Rush Hour Traffic Multiplier (Demo)
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { factor: 1.0, label: 'Standard (×1.0)' },
                    { factor: 1.3, label: 'Rush Hour (×1.3)' },
                    { factor: 1.6, label: 'Heavy Jam (×1.6)' },
                  ].map((r) => (
                    <button
                      key={r.factor}
                      type="button"
                      onClick={() => handleRushHour(r.factor)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        currentRush === r.factor
                          ? 'bg-[var(--brand)] text-white border-[var(--brand)] shadow-xs'
                          : 'bg-[var(--surface-2)] text-[var(--ink)] border-[var(--border)]'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 9.2 Simulate Patients */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  Simulate Queue Arrivals in {activeDirectorDept?.name || 'Department'} (SIM Badge)
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--ink-faint)]">Count:</span>
                    {[3, 6, 12].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setSimCount(cnt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          simCount === cnt
                            ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                            : 'bg-[var(--surface-2)] text-[var(--ink)] border-[var(--border)]'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    variant="primary"
                    iconLeft={<Users size={14} />}
                    onClick={handleSimulate}
                  >
                    Inject {simCount} Patients
                  </Button>
                </div>
              </div>
            </div>

            {/* 9.5 Scenario Presets Grid */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3.5">
              <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                One-Click Demo Scenarios (NeverQ2 §13)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <button
                  type="button"
                  onClick={() => runScenario('delay')}
                  className="p-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--brand)] border border-transparent text-left flex flex-col gap-1 transition-colors"
                >
                  <span className="font-bold text-xs text-[var(--ink)]">Doctor Delay 15m</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Sets delay timer on Desk 1</span>
                </button>

                <button
                  type="button"
                  onClick={() => runScenario('open-c2')}
                  className="p-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--brand)] border border-transparent text-left flex flex-col gap-1 transition-colors"
                >
                  <span className="font-bold text-xs text-[var(--ink)]">Open Desk 2</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Brings second room online</span>
                </button>

                <button
                  type="button"
                  onClick={() => runScenario('urgent')}
                  className="p-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--brand)] border border-transparent text-left flex flex-col gap-1 transition-colors"
                >
                  <span className="font-bold text-xs text-[var(--accent)]">Urgent Insert</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Jumps queue to front</span>
                </button>

                <button
                  type="button"
                  onClick={() => runScenario('no-show')}
                  className="p-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--brand)] border border-transparent text-left flex flex-col gap-1 transition-colors"
                >
                  <span className="font-bold text-xs text-[var(--danger)]">No-Show Requeue</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Passes deadline & requeues</span>
                </button>

                <button
                  type="button"
                  onClick={() => runScenario('story-setup')}
                  className="p-3 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--brand)] border border-transparent text-left flex flex-col gap-1 transition-colors"
                >
                  <span className="font-bold text-xs text-[var(--brand)]">Story Setup</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">Initializes Eye stats</span>
                </button>
              </div>
            </div>

            {/* 9.7 Device Launcher & Multi-Tab Testing */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
              <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                Multi-Device Testing Launcher
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] hover:text-[var(--brand)] flex items-center gap-1.5 transition-colors"
                >
                  <span>Open Customer Map</span>
                  <ExternalLink size={13} />
                </a>

                <a
                  href="/staff"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] hover:text-[var(--brand)] flex items-center gap-1.5 transition-colors"
                >
                  <span>Open Staff Console</span>
                  <ExternalLink size={13} />
                </a>

                <a
                  href={`/board/${orgs[0]?.id || 'harbour'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] hover:text-[var(--brand)] flex items-center gap-1.5 transition-colors"
                >
                  <span>Open Wait Board</span>
                  <ExternalLink size={13} />
                </a>

                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={<Copy size={13} />}
                  onClick={copyOriginLink}
                >
                  Copy App URL
                </Button>
              </div>
            </div>

            {/* 9.6 Demo Checklist Panel (16 Steps from NeverQ2 §13) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                  Demo Evaluation Checklist (NeverQ2 §13)
                </h3>
                <span className="text-[11px] font-semibold text-[var(--ink-faint)]">
                  Highlighted = Keep List
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {[
                  { id: 1, text: '1. Landing discovery: Map + cards loaded cleanly' },
                  { id: 2, text: '2. Nearest vs Fastest sort comparison', keep: true },
                  { id: 3, text: '3. Origin location switch (Demo Presets / Pin)', keep: true },
                  { id: 4, text: '4. Join queue with phone & priority claim', keep: true },
                  { id: 5, text: '5. Live ticket page: live position & ETA' },
                  { id: 6, text: '6. Travel mode toggle & Leave-by calculator' },
                  { id: 7, text: '7. "I\'m here" check-in within ~300m range', keep: true },
                  { id: 8, text: '8. Staff call-next triggers spoken announcement', keep: true },
                  { id: 9, text: '9. Called takeover card with grace countdown' },
                  { id: 10, text: '10. Doctor delay modal (+15m) propagates ETA', keep: true },
                  { id: 11, text: '11. Urgent case insert jumps front of queue' },
                  { id: 12, text: '12. Consultation started & completed (Done)', keep: true },
                  { id: 13, text: '13. Missed deadline triggers single requeue' },
                  { id: 14, text: '14. Offline banner & live socket reconnection' },
                  { id: 15, text: '15. Theme switch: crisp contrast across pages' },
                  { id: 16, text: '16. One-click Demo reset completes cleanly', keep: true },
                ].map((item) => {
                  const checked = Boolean(checklist[item.id]);
                  return (
                    <label
                      key={item.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                        item.keep
                          ? checked
                            ? 'bg-[var(--brand)]/10 border-[var(--brand)] font-bold text-[var(--brand)]'
                            : 'bg-[var(--surface-2)] border-[var(--brand)]/40 font-semibold'
                          : checked
                          ? 'bg-[var(--surface-2)] border-[var(--border)] line-through opacity-70'
                          : 'bg-[var(--surface)] border-[var(--border)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChecklistItem(item.id)}
                        className="rounded accent-[var(--brand)]"
                      />
                      <span className="truncate">{item.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Session Activity Log */}
            {activityLogs.length > 0 && (
              <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-2.5">
                <h4 className="font-heading font-extrabold text-xs uppercase tracking-wider text-[var(--ink-faint)]">
                  Session Activity Log
                </h4>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto no-scrollbar">
                  {activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between text-xs p-2 rounded-xl bg-[var(--surface-2)]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-[var(--brand)]">{log.title}</span>
                        <span className="text-[var(--ink-faint)] truncate">{log.detail}</span>
                      </div>
                      <span className="text-[10px] text-[var(--ink-faint)] tnum shrink-0">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───────────── Modals ───────────── */}

      {/* 8.3 Create / Edit Hospital Modal */}
      {showOrgModal && (
        <HospitalFormModal
          existingOrg={editingOrg}
          onClose={() => {
            setShowOrgModal(false);
            setEditingOrg(null);
          }}
          onSuccess={() => {
            setShowOrgModal(false);
            setEditingOrg(null);
            loadAllData();
          }}
        />
      )}

      {/* Confirm Toggle Hospital Open / Close */}
      {confirmToggleOrg && (
        <ConfirmDialog
          isOpen={true}
          title={`${confirmToggleOrg.open !== false ? 'Close' : 'Re-open'} ${confirmToggleOrg.name}?`}
          description={
            confirmToggleOrg.open !== false
              ? 'Closing this facility will mark it unavailable for customer queue booking.'
              : 'Re-opening will allow patients to discover and join queues at this facility.'
          }
          confirmText={confirmToggleOrg.open !== false ? 'Close Facility' : 'Re-open'}
          onConfirm={async () => {
            await api.toggleOrgStatus(confirmToggleOrg.id);
            notify.success(`Status updated for ${confirmToggleOrg.name}`);
            setConfirmToggleOrg(null);
            loadAllData();
          }}
          onClose={() => setConfirmToggleOrg(null)}
        />
      )}

      {/* 9.1 Confirm Demo Reset Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        loading={resetting}
        title="Reset All Demo Data?"
        description="This will restore all hospital queues and seed states. Any active tickets in customer browsers will transition to the ended state cleanly."
        confirmText="Reset Entire Demo"
        onConfirm={handleReset}
        onClose={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

// ───────────── Phase 8.3: Create / Edit Hospital Form Modal ─────────────
function HospitalFormModal({ existingOrg, onClose, onSuccess }) {
  const [name, setName] = useState(existingOrg?.name || '');
  const [lat, setLat] = useState(existingOrg?.lat || 13.0450);
  const [lng, setLng] = useState(existingOrg?.lng || 80.2450);
  const [area, setArea] = useState(existingOrg?.area || 'Mylapore');
  const [address, setAddress] = useState(existingOrg?.address || '');
  const [hours, setHours] = useState(existingOrg?.hours || '08:00–20:00');
  const [staffPin, setStaffPin] = useState('');

  // Rules (Appendix A.7)
  const [arriveByMin, setArriveByMin] = useState(existingOrg?.rules?.arriveByMin ?? 15);
  const [graceMin, setGraceMin] = useState(existingOrg?.rules?.graceMin ?? 10);
  const [remoteCap, setRemoteCap] = useState(existingOrg?.rules?.remoteCap ?? 15);
  const [remoteEnabled, setRemoteEnabled] = useState(existingOrg?.rules?.remoteEnabled !== false);
  const [seniorCredit, setSeniorCredit] = useState(existingOrg?.rules?.priorityCreditMin?.senior ?? 10);
  const [pregnantCredit, setPregnantCredit] = useState(existingOrg?.rules?.priorityCreditMin?.pregnant ?? 15);
  const [disabledCredit, setDisabledCredit] = useState(existingOrg?.rules?.priorityCreditMin?.disabled ?? 20);

  // Departments & Counters (preserves IDs on edit)
  const [departments, setDepartments] = useState(() => {
    if (existingOrg?.departments?.length) {
      return existingOrg.departments.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code || d.name?.charAt(0).toUpperCase() || 'G',
        defaultMin: d.defaultMin || 12,
        counters: (d.counters || []).map((c) => ({
          id: c.id,
          name: c.name || 'Desk',
        })),
      }));
    }
    return [
      {
        id: 'gen',
        name: 'General OPD',
        code: 'G',
        defaultMin: 12,
        counters: [
          { id: 'ctr-1', name: 'Consultation Desk 1' },
          { id: 'ctr-2', name: 'Consultation Desk 2' },
        ],
      },
    ];
  });

  const [loading, setLoading] = useState(false);

  const handleUseDemoCoords = () => {
    setLat(13.0450);
    setLng(80.2450);
    setArea('Central Chennai');
    notify.info('Coordinates set to Chennai Central');
  };

  const handleAddDepartment = () => {
    const nextIdx = departments.length + 1;
    setDepartments((prev) => [
      ...prev,
      {
        id: `dept-${Date.now().toString(36)}`,
        name: `Specialty Unit ${nextIdx}`,
        code: `U${nextIdx}`,
        defaultMin: 15,
        counters: [
          { id: `ctr-${Date.now().toString(36)}-1`, name: 'Consultation Desk 1' },
        ],
      },
    ]);
  };

  const handleAddCounter = (deptIndex) => {
    setDepartments((prev) => {
      const copy = [...prev];
      const dept = { ...copy[deptIndex] };
      const nextCtr = (dept.counters?.length || 0) + 1;
      dept.counters = [
        ...(dept.counters || []),
        { id: `ctr-${Date.now().toString(36)}-${nextCtr}`, name: `Consultation Desk ${nextCtr}` },
      ];
      copy[deptIndex] = dept;
      return copy;
    });
  };

  const handleRemoveDepartment = (deptIndex) => {
    setDepartments((prev) => prev.filter((_, i) => i !== deptIndex));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      notify.error('Hospital name is required');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        lat: Number(lat),
        lng: Number(lng),
        area: area.trim(),
        address: address.trim() || `${area}, Chennai`,
        hours: hours.trim(),
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name.trim(),
          code: d.code?.trim().toUpperCase() || d.name?.charAt(0).toUpperCase() || 'G',
          defaultMin: Number(d.defaultMin) || 12,
          counters: (d.counters || []).map((c) => ({
            id: c.id,
            name: c.name.trim(),
          })),
        })),
        rules: {
          arriveByMin: Number(arriveByMin),
          graceMin: Number(graceMin),
          remoteCap: Number(remoteCap),
          remoteEnabled: Boolean(remoteEnabled),
          priorityCreditMin: {
            senior: Number(seniorCredit),
            pregnant: Number(pregnantCredit),
            disabled: Number(disabledCredit),
            none: 0,
          },
        },
      };

      if (existingOrg) {
        if (staffPin.trim()) {
          payload.staffPin = staffPin.trim();
        }
        await api.updateOrg(existingOrg.id, payload);
        notify.success('Hospital updated successfully');
      } else {
        payload.staffPin = staffPin.trim() || '1234';
        await api.createOrg(payload);
        notify.success('New hospital created and live on map');
      }
      onSuccess();
    } catch (err) {
      notify.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90dvh] overflow-y-auto no-scrollbar rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            {existingOrg ? `Edit ${existingOrg.name}` : 'Create New Hospital Facility'}
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Basic Details */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              General Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink)]">Hospital Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Marina Care Clinic"
                  required
                  className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink)]">Operating Hours</label>
                <input
                  type="text"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="08:00–20:00"
                  required
                  className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink)]">Area / Locality</label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Adyar"
                  className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--ink)]">Staff PIN</label>
                <input
                  type="password"
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value)}
                  placeholder={existingOrg ? 'Leave blank to keep current PIN' : '4-digit PIN (default 1234)'}
                  className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-[var(--ink)]">Full Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address, City, PIN"
                className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)]"
              />
            </div>
          </div>

          {/* Map Location */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1">
                <MapPin size={13} className="text-[var(--brand)]" />
                <span>Map Coordinates & Location Picker</span>
              </label>
              <button
                type="button"
                onClick={handleUseDemoCoords}
                className="text-[11px] font-bold text-[var(--brand)] hover:underline"
              >
                Use Chennai Central
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                placeholder="Latitude"
                className="h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-bold tnum"
              />
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                placeholder="Longitude"
                className="h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-bold tnum"
              />
            </div>

            <div className="rounded-2xl overflow-hidden border border-[var(--border)] h-36 relative mt-1">
              <MapView
                mode="pick"
                center={[Number(lng) || 80.2450, Number(lat) || 13.0450]}
                user={{ lat: Number(lat) || 13.0450, lng: Number(lng) || 80.2450, label: name || 'Hospital Pin' }}
                onPick={(coords) => {
                  setLat(Number(coords.lat.toFixed(5)));
                  setLng(Number(coords.lng.toFixed(5)));
                }}
                interactive={true}
                zoom={13}
              />
            </div>
          </div>

          {/* Queue Rules (Appendix A.7) */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--border)]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-faint)]">
              Queue & Priority Rules
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--ink-faint)]">Arrive By (min)</label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={arriveByMin}
                  onChange={(e) => setArriveByMin(Number(e.target.value))}
                  className="h-9 px-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold tnum text-[var(--ink)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--ink-faint)]">Grace (min)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={graceMin}
                  onChange={(e) => setGraceMin(Number(e.target.value))}
                  className="h-9 px-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold tnum text-[var(--ink)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--ink-faint)]">Remote Cap</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={remoteCap}
                  onChange={(e) => setRemoteCap(Number(e.target.value))}
                  className="h-9 px-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold tnum text-[var(--ink)]"
                />
              </div>

              <div className="flex flex-col gap-1 justify-center">
                <label className="text-[11px] font-bold text-[var(--ink-faint)]">Remote Join</label>
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink)] cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={remoteEnabled}
                    onChange={(e) => setRemoteEnabled(e.target.checked)}
                    className="rounded accent-[var(--brand)]"
                  />
                  <span>Enabled</span>
                </label>
              </div>
            </div>

            {/* Priority Credit Minutes per Claim */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-[var(--ink-faint)]">Priority Credit (Minutes advanced)</span>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1 bg-[var(--surface-2)] px-2 py-1 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-bold text-[var(--ink-faint)]">Senior:</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={seniorCredit}
                    onChange={(e) => setSeniorCredit(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-bold text-[var(--ink)] tnum"
                  />
                  <span className="text-[10px] text-[var(--ink-faint)]">m</span>
                </div>

                <div className="flex items-center gap-1 bg-[var(--surface-2)] px-2 py-1 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-bold text-[var(--ink-faint)]">Pregnant:</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={pregnantCredit}
                    onChange={(e) => setPregnantCredit(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-bold text-[var(--ink)] tnum"
                  />
                  <span className="text-[10px] text-[var(--ink-faint)]">m</span>
                </div>

                <div className="flex items-center gap-1 bg-[var(--surface-2)] px-2 py-1 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-bold text-[var(--ink-faint)]">Disabled:</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={disabledCredit}
                    onChange={(e) => setDisabledCredit(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-bold text-[var(--ink)] tnum"
                  />
                  <span className="text-[10px] text-[var(--ink-faint)]">m</span>
                </div>
              </div>
            </div>
          </div>

          {/* Departments & Counters List */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Departments & Desks ({departments.length})
              </h4>
              <button
                type="button"
                onClick={handleAddDepartment}
                className="text-[11px] font-bold text-[var(--brand)] hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Add Department
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {departments.map((dept, dIdx) => (
                <div key={dept.id || dIdx} className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={dept.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDepartments((prev) => {
                            const copy = [...prev];
                            copy[dIdx] = { ...copy[dIdx], name: val };
                            return copy;
                          });
                        }}
                        placeholder="Department name"
                        className="h-8 px-2.5 flex-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--ink)]"
                      />
                      <input
                        type="text"
                        value={dept.code}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDepartments((prev) => {
                            const copy = [...prev];
                            copy[dIdx] = { ...copy[dIdx], code: val };
                            return copy;
                          });
                        }}
                        placeholder="Code (e.g. G)"
                        className="w-14 h-8 px-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-center font-bold text-[var(--ink)] uppercase"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="3"
                          max="120"
                          value={dept.defaultMin}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDepartments((prev) => {
                              const copy = [...prev];
                              copy[dIdx] = { ...copy[dIdx], defaultMin: val };
                              return copy;
                            });
                          }}
                          className="w-12 h-8 px-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-center font-bold tnum text-[var(--ink)]"
                        />
                        <span className="text-[10px] text-[var(--ink-faint)]">min</span>
                      </div>
                    </div>

                    {departments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDepartment(dIdx)}
                        className="p-1 text-[var(--danger)] hover:opacity-80"
                        title="Remove department"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Counters Sublist */}
                  <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-[var(--border)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase">
                        Counters ({dept.counters?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddCounter(dIdx)}
                        className="text-[10px] font-bold text-[var(--brand)] hover:underline"
                      >
                        + Add Desk
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(dept.counters || []).map((ctr, cIdx) => (
                        <div key={ctr.id || cIdx} className="flex items-center gap-1 bg-[var(--surface)] px-2 py-1 rounded-lg border border-[var(--border)]">
                          <input
                            type="text"
                            value={ctr.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDepartments((prev) => {
                                const copy = [...prev];
                                const d = { ...copy[dIdx] };
                                const ctrs = [...(d.counters || [])];
                                ctrs[cIdx] = { ...ctrs[cIdx], name: val };
                                d.counters = ctrs;
                                copy[dIdx] = d;
                                return copy;
                              });
                            }}
                            className="bg-transparent text-[11px] font-semibold text-[var(--ink)] w-28"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={loading}>
              {existingOrg ? 'Save Changes' : 'Create Facility'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
