import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { connectDB, disconnectDB } from './connect.js';
import { Org, Department, Counter, Ticket, Settings, AuditEvent, BlockedPhone } from './models/index.js';

export const SEED_DATA = [
  {
    org: {
      _id: 'harbour',
      name: 'Harbour Care Clinic',
      category: 'hospital',
      demo: true,
      seeded: true,
      lat: 13.0338,
      lng: 80.2676,
      area: 'Mylapore',
      address: '42 Luz Church Road, Mylapore, Chennai 600004',
      hours: '8:00 AM – 8:00 PM',
      rules: {
        priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
        arriveByMin: 15,
        graceMin: 5,
        remoteCap: 10,
        remoteEnabled: true,
      },
    },
    departments: [
      {
        key: 'gen',
        name: 'General OPD',
        code: 'G',
        defaultMin: 12,
        stats: { n: 5, mean: 13.5, m2: 8.2 },
        statsHistory: [13.0, 13.2, 13.5, 13.8, 13.5],
        seq: 14,
        order: 1,
      },
      {
        // NeverQ2 §11 story setup constraint: n < 3 so join screen shows Low confidence
        key: 'eye',
        name: 'Eye Clinic',
        code: 'E',
        defaultMin: 22,
        stats: { n: 2, mean: 24.0, m2: 12.0 },
        statsHistory: [23.5, 24.0],
        seq: 9,
        order: 2,
      },
      {
        key: 'pharm',
        name: 'Pharmacy',
        code: 'P',
        defaultMin: 5,
        stats: { n: 12, mean: 4.8, m2: 2.1 },
        statsHistory: [5.0, 4.9, 4.8, 4.8, 4.8],
        seq: 31,
        order: 3,
      },
    ],
    counters: [
      { _id: 'c1', deptKey: 'gen', name: 'Room 1 — Dr. Ananya', state: 'open' },
      { _id: 'c2', deptKey: 'gen', name: 'Room 2 — Dr. Raman', state: 'open' },
      { _id: 'c3', deptKey: 'eye', name: 'Optometry Room 1', state: 'open' },
      { _id: 'c4', deptKey: 'pharm', name: 'Dispensing Counter 1', state: 'open' },
      { _id: 'c5', deptKey: 'pharm', name: 'Dispensing Counter 2', state: 'open' },
    ],
  },
  {
    org: {
      _id: 'lakeside',
      name: 'Lakeside General Hospital',
      category: 'hospital',
      demo: true,
      seeded: true,
      lat: 13.0850,
      lng: 80.2101,
      area: 'Anna Nagar',
      address: '15 2nd Avenue, Anna Nagar East, Chennai 600102',
      hours: '24 Hours Emergency & OPD',
      rules: {
        priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
        arriveByMin: 15,
        graceMin: 5,
        remoteCap: 10,
        remoteEnabled: true,
      },
    },
    departments: [
      {
        key: 'gen',
        name: 'General OPD',
        code: 'G',
        defaultMin: 10,
        stats: { n: 8, mean: 10.2, m2: 5.1 },
        statsHistory: [10.0, 10.1, 10.2],
        seq: 22,
        order: 1,
      },
      {
        // Lakeside Eye is the fastest (defaultMin 8 vs Harbour 22)
        key: 'eye',
        name: 'Eye Clinic',
        code: 'E',
        defaultMin: 8,
        stats: { n: 14, mean: 7.5, m2: 3.2 },
        statsHistory: [7.8, 7.6, 7.5],
        seq: 18,
        order: 2,
      },
      {
        key: 'cardio',
        name: 'Cardiology',
        code: 'C',
        defaultMin: 20,
        stats: { n: 4, mean: 19.0, m2: 9.0 },
        statsHistory: [19.5, 19.0],
        seq: 7,
        order: 3,
      },
      {
        key: 'ortho',
        name: 'Orthopaedics',
        code: 'O',
        defaultMin: 15,
        stats: { n: 6, mean: 14.5, m2: 6.8 },
        statsHistory: [14.8, 14.5],
        seq: 11,
        order: 4,
      },
    ],
    counters: [
      { _id: 'c6', deptKey: 'gen', name: 'OPD Desk 1 — Dr. Priya', state: 'open' },
      { _id: 'c7', deptKey: 'gen', name: 'OPD Desk 2 — Dr. Joseph', state: 'open' },
      { _id: 'c8', deptKey: 'gen', name: 'OPD Desk 3 — Dr. Vikram', state: 'open' },
      { _id: 'c9', deptKey: 'eye', name: 'Vision Testing — Dr. Meera', state: 'open' },
      { _id: 'c10', deptKey: 'eye', name: 'Ophthalmology Exam 2', state: 'open' },
      { _id: 'c11', deptKey: 'cardio', name: 'Cardio Suite 1 — Dr. Nair', state: 'open' },
      { _id: 'c12', deptKey: 'ortho', name: 'Ortho Consultation Room', state: 'open' },
    ],
  },
  {
    org: {
      _id: 'apollo-demo',
      name: 'Metro Mercy Hospital',
      category: 'hospital',
      demo: true,
      seeded: true,
      lat: 13.0067,
      lng: 80.2570,
      area: 'Adyar',
      address: '88 Sardar Patel Road, Adyar, Chennai 600020',
      hours: '7:30 AM – 10:00 PM',
      rules: {
        priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
        arriveByMin: 15,
        graceMin: 5,
        remoteCap: 10,
        remoteEnabled: true,
      },
    },
    departments: [
      {
        key: 'gen',
        name: 'General OPD',
        code: 'G',
        defaultMin: 12,
        stats: { n: 10, mean: 11.8, m2: 4.9 },
        statsHistory: [12.0, 11.9, 11.8],
        seq: 34,
        order: 1,
      },
      {
        key: 'cardio',
        name: 'Cardiology',
        code: 'C',
        defaultMin: 18,
        stats: { n: 3, mean: 17.5, m2: 8.0 },
        statsHistory: [18.0, 17.5],
        seq: 8,
        order: 2,
      },
      {
        key: 'pharm',
        name: 'Pharmacy',
        code: 'P',
        defaultMin: 4,
        stats: { n: 20, mean: 3.9, m2: 1.5 },
        statsHistory: [4.0, 3.9, 3.9],
        seq: 52,
        order: 3,
      },
      {
        key: 'ortho',
        name: 'Orthopaedics',
        code: 'O',
        defaultMin: 16,
        stats: { n: 4, mean: 15.0, m2: 7.2 },
        statsHistory: [15.2, 15.0],
        seq: 9,
        order: 4,
      },
    ],
    counters: [
      { _id: 'c13', deptKey: 'gen', name: 'Cubicle 1 — Dr. Arvind', state: 'open' },
      { _id: 'c14', deptKey: 'gen', name: 'Cubicle 2 — Dr. Deepa', state: 'open' },
      { _id: 'c15', deptKey: 'cardio', name: 'Cardiac OPD Room 3', state: 'open' },
      { _id: 'c16', deptKey: 'pharm', name: 'Pharma Counter A', state: 'open' },
      { _id: 'c17', deptKey: 'ortho', name: 'Ortho OPD Desk 2', state: 'open' },
    ],
  },
];

/**
 * Ensures initial seed data exists. Idempotent: does nothing if already seeded.
 */
export async function seedIfEmpty() {
  const existingCount = await Org.countDocuments({ seeded: true });
  if (existingCount > 0) {
    return { seeded: false, message: 'Database already seeded.' };
  }

  const pinHash = await bcrypt.hash(env.SEED_STAFF_PIN || '1234', 10);

  // Initialize Settings
  await Settings.findByIdAndUpdate(
    'global',
    { $setOnInsert: { clockOffsetMs: 0, rushFactor: 1, lastSweepAt: 0, tokenEpoch: 1 } },
    { upsert: true }
  );

  for (const group of SEED_DATA) {
    // 1. Create Org
    await Org.create({
      ...group.org,
      staffPinHash: pinHash,
      pinVersion: 1,
    });

    // 2. Create Departments
    const deptsToInsert = group.departments.map((d) => ({
      ...d,
      orgId: group.org._id,
    }));
    await Department.insertMany(deptsToInsert);

    // 3. Create Counters
    const countersToInsert = group.counters.map((c) => ({
      ...c,
      orgId: group.org._id,
      currentTicketId: null,
      delayUntil: null,
      delayReason: null,
      resumeAt: null,
    }));
    await Counter.insertMany(countersToInsert);
  }

  return { seeded: true, orgsCreated: SEED_DATA.length };
}

/**
 * Resets the database to initial seed state in < 3 s.
 * - Deletes all tickets, audit events, blocked phones
 * - Deletes non-seeded orgs, depts, counters
 * - Restores seeded orgs, departments (stats, seq), and counters
 * - Resets clockOffsetMs = 0, rushFactor = 1 (preserves tokenEpoch so sessions survive)
 */
export async function resetToSeed() {
  const startTime = Date.now();

  // 1. Clear tickets, audit events, and blocked phones
  await Promise.all([
    Ticket.deleteMany({}),
    AuditEvent.deleteMany({}),
    BlockedPhone.deleteMany({}),
  ]);

  // 2. Remove non-seeded orgs, depts, counters
  const seededOrgIds = SEED_DATA.map((d) => d.org._id);
  await Promise.all([
    Org.deleteMany({ _id: { $nin: seededOrgIds } }),
    Department.deleteMany({ orgId: { $nin: seededOrgIds } }),
    Counter.deleteMany({ orgId: { $nin: seededOrgIds } }),
  ]);

  const pinHash = await bcrypt.hash(env.SEED_STAFF_PIN || '1234', 10);

  // 3. Restore seeded orgs, departments, and counters
  for (const group of SEED_DATA) {
    await Org.findByIdAndUpdate(
      group.org._id,
      {
        ...group.org,
        staffPinHash: pinHash,
        open: true,
      },
      { upsert: true }
    );

    // Upsert departments to restore original baseline stats and seq
    for (const d of group.departments) {
      await Department.findOneAndUpdate(
        { orgId: group.org._id, key: d.key },
        { ...d, orgId: group.org._id },
        { upsert: true }
      );
    }

    // Upsert counters to restore open state and clear any active ticket/delays
    for (const c of group.counters) {
      await Counter.findByIdAndUpdate(
        c._id,
        {
          ...c,
          orgId: group.org._id,
          state: 'open',
          currentTicketId: null,
          delayUntil: null,
          delayReason: null,
          resumeAt: null,
        },
        { upsert: true }
      );
    }
  }

  // 4. Reset clock and rush factor in Settings; preserve tokenEpoch so sessions survive
  await Settings.findByIdAndUpdate(
    'global',
    { clockOffsetMs: 0, rushFactor: 1, lastSweepAt: 0 },
    { upsert: true }
  );

  const durationMs = Date.now() - startTime;
  return { success: true, durationMs };
}

// Standalone CLI execution
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const isReset = process.argv.includes('--reset');

  connectDB()
    .then(async () => {
      if (isReset) {
        console.log('[Seed] Resetting database to seed state...');
        const res = await resetToSeed();
        console.log(`[Seed] Reset complete in ${res.durationMs}ms.`);
      } else {
        console.log('[Seed] Seeding database if empty...');
        const res = await seedIfEmpty();
        console.log(`[Seed] ${res.message || `Seeded ${res.orgsCreated} hospitals.`}`);
      }
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed Error]:', err);
      try { await disconnectDB(); } catch {}
      process.exit(1);
    });
}
