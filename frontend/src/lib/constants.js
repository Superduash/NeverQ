import {
  Stethoscope, Eye, HeartPulse, Pill, Bone, Baby, Brain, Ear, Smile,
  Activity, Syringe, Microscope, ScanLine, Layers,
} from 'lucide-react';

// ───────────── Wait thresholds (minutes) ─────────────
// <15 green · 15–40 amber · >40 red
export const WAIT_THRESHOLDS = {
  good: 15,
  bad: 40,
};

export function waitStatus(midMinutes) {
  if (midMinutes == null || Number.isNaN(midMinutes)) return 'mid';
  if (midMinutes < WAIT_THRESHOLDS.good) return 'good';
  if (midMinutes > WAIT_THRESHOLDS.bad) return 'bad';
  return 'mid';
}

// ───────────── Route paths ─────────────
export const PATHS = {
  home: '/',
  app: '/app',
  hospital: (id) => `/hospital/${id}`,
  join: (orgId, deptId) => `/join/${orgId}/${deptId}`,
  ticket: (token) => `/t/${token}`,
  myTicket: '/ticket',
  saved: '/saved',
  more: '/more',
  board: (id) => `/board/${id}`,
  staffLogin: '/staff/login',
  staff: '/staff',
  adminLogin: '/admin/login',
  admin: '/admin',
};

// ───────────── Departments: icon + tint ─────────────
export const DEPT_ICONS = {
  All: Layers,
  'General OPD': Stethoscope,
  'Eye Clinic': Eye,
  Cardiology: HeartPulse,
  Pharmacy: Pill,
  Orthopaedics: Bone,
  Paediatrics: Baby,
  Pediatrics: Baby,
  Neurology: Brain,
  ENT: Ear,
  Dental: Smile,
  Dermatology: Activity,
  Vaccination: Syringe,
  Laboratory: Microscope,
  Radiology: ScanLine,
};
export const DEFAULT_DEPT_ICON = Stethoscope;

export function deptIcon(name) {
  return DEPT_ICONS[name] || DEFAULT_DEPT_ICON;
}

// One tint per department (token-based so both themes work)
const DEPT_TINTS = [
  { fg: 'var(--tint-1-fg)', bg: 'var(--tint-1-bg)' },
  { fg: 'var(--tint-2-fg)', bg: 'var(--tint-2-bg)' },
  { fg: 'var(--tint-3-fg)', bg: 'var(--tint-3-bg)' },
  { fg: 'var(--tint-4-fg)', bg: 'var(--tint-4-bg)' },
  { fg: 'var(--tint-5-fg)', bg: 'var(--tint-5-bg)' },
  { fg: 'var(--tint-6-fg)', bg: 'var(--tint-6-bg)' },
];

export function deptTint(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return DEPT_TINTS[hash % DEPT_TINTS.length];
}

// ───────────── Emergency ─────────────
export const EMERGENCY_NUMBER = '112';

// ───────────── Environment flags ─────────────
export const IS_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const MOCK_STAFF_PIN_HINT = import.meta.env.VITE_MOCK_STAFF_PIN || '1234';
