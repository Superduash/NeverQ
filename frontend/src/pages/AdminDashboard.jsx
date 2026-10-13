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
  const [simDept, setSimDept] = useState('gen');
  const [simCount, setSimCount] = useState(6);
  const [customFfMins, setCustomFfMins] = useState(15);
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

  const handleSimulate = async () => {
    try {
      await api.simulatePatients({
        orgId: hospitals[0]?.id || 'harbour',
        deptId: simDept,
        count: simCount,
      });
      notify.success(`Simulated ${simCount} patients in department`);
      logAction('Simulate Patients', `Added ${simCount} simulated tickets with mixed priorities`);
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

  // Scenario Presets (Phase 9.5)
  const runScenario = async (type) => {
    try {
      if (type === 'delay') {
        const orgId = hospitals[0]?.id || 'harbour';
        const counterId = 'c1';
        await api.setCounterDelay(counterId, { minutes: 15, reason: 'Emergency phone consult' });
        notify.success('Scenario executed: Doctor delayed by 15m');
        logAction('Scenario: Delay', 'Set Room 1 delay to 15m');
      } else if (type === 'open-c2') {
        const counterId = 'c2';
        await api.setCounterState(counterId, { state: 'open' });
        notify.success('Scenario executed: Opened Counter 2');
        logAction('Scenario: Open Counter', 'Room 2 opened for consultations');
      } else if (type === 'urgent') {
        const deptId = 'gen';
        await api.insertUrgent({ deptId, name: 'Triage Patient', reason: 'Critical breathlessness' });
        notify.success('Scenario executed: Urgent case inserted');
        logAction('Scenario: Urgent Case', 'Inserted patient at the front of General OPD');
      } else if (type === 'no-show') {
        // Create remote ticket and advance clock past deadline
        const deptId = 'gen';
        const orgId = hospitals[0]?.id || 'harbour';
        await api.createTicket({
          orgId,
          deptId,
          name: 'Remote Patient (No-show demo)',
          phone: '+919888800000',
          priority: 'none',
        });
        await api.demoFastForward({ minutes: 25 });
        notify.warning('Scenario executed: Created remote ticket & fast-forwarded past deadline');
        logAction('Scenario: No-show', 'Created remote ticket and advanced past deadline to trigger requeue');
      }
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
                  {summary?.totalCounters || 6}
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
                          <span className="font-bold text-[var(--ink)] tnum">{hospital.departments?.length || 1} units</span>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-[var(--brand)]" />
                  <h3 className="font-heading font-extrabold text-sm uppercase tracking-wider text-[var(--ink)]">
                    Realtime Simulation Controls
                  </h3>
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

              {/* 9.3 Fast Forward Clock Controls */}
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
                  Simulate Queue Arrivals (SIM Badge)
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={simDept}
                    onChange={(e) => setSimDept(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                  >
                    <option value="gen">General OPD</option>
                    <option value="eye">Eye Clinic</option>
                    <option value="pharm">Pharmacy</option>
                  </select>

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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
  const [staffPin, setStaffPin] = useState(existingOrg?.staffPin || '1234');
  const [defaultMin, setDefaultMin] = useState(existingOrg?.departments?.[0]?.defaultMin || 12);
  const [loading, setLoading] = useState(false);

  const handleUseDemoCoords = () => {
    setLat(13.0450);
    setLng(80.2450);
    setArea('Central Chennai');
    notify.info('Coordinates set to Chennai Central');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      notify.error('Hospital name is required');
      return;
    }

    setLoading(true);
    try {
      if (existingOrg) {
        await api.updateOrg(existingOrg.id, {
          name: name.trim(),
          lat: Number(lat),
          lng: Number(lng),
          area: area.trim(),
          address: address.trim(),
          staffPin: staffPin.trim(),
        });
        notify.success('Hospital updated successfully');
      } else {
        await api.createOrg({
          name: name.trim(),
          lat: Number(lat),
          lng: Number(lng),
          area: area.trim(),
          address: address.trim() || `${area}, Chennai`,
          staffPin: staffPin.trim() || '1234',
        });
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
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            {existingOrg ? 'Edit Facility' : 'Create New Hospital'}
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1">
                <MapPin size={13} className="text-[var(--brand)]" />
                <span>Map Coordinates</span>
              </label>
              <button
                type="button"
                onClick={handleUseDemoCoords}
                className="text-[11px] font-bold text-[var(--brand)] hover:underline"
              >
                Use Demo Origin
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-bold tnum"
              />
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitude"
                className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-bold tnum"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
                type="text"
                value={staffPin}
                onChange={(e) => setStaffPin(e.target.value)}
                placeholder="4-digit PIN"
                className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
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
