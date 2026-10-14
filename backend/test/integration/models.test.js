// backend/test/integration/models.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Org, Department, Counter, Ticket, Settings, AuditEvent } from '../../src/db/models/index.js';
import { seedIfEmpty, resetToSeed } from '../../src/db/seed.js';

describe('Phase 2 — Data Models, Indexes & Seed Gate Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('1. seedIfEmpty() is idempotent: running twice produces identical data', async () => {
    // First run: seeds data
    const res1 = await seedIfEmpty();
    expect(res1.seeded).toBe(true);

    const orgCount1 = await Org.countDocuments();
    const deptCount1 = await Department.countDocuments();
    const counterCount1 = await Counter.countDocuments();

    expect(orgCount1).toBe(3);
    expect(deptCount1).toBe(11);
    expect(counterCount1).toBe(17);

    // Second run: must be idempotent and not duplicate data
    const res2 = await seedIfEmpty();
    expect(res2.seeded).toBe(false);

    const orgCount2 = await Org.countDocuments();
    const deptCount2 = await Department.countDocuments();
    const counterCount2 = await Counter.countDocuments();

    expect(orgCount2).toBe(orgCount1);
    expect(deptCount2).toBe(deptCount1);
    expect(counterCount2).toBe(counterCount1);
  });

  it('2. TTL index is present on Ticket.expireAt', async () => {
    await Ticket.createIndexes();
    const indexes = await Ticket.collection.indexes();
    const ttlIndex = indexes.find((idx) => idx.name === 'expireAt_1');

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex).toHaveProperty('expireAfterSeconds', 0);
  });

  it('3. Duplicate active remote ticket for same phone/org fails with E11000; succeeds after completion', async () => {
    await Ticket.createIndexes();

    const phone = '+919876543210';
    const orgId = 'harbour';

    // 1. Create first active remote ticket
    const ticket1 = await Ticket.create({
      orgId,
      deptKey: 'gen',
      token: 'tok-test-remote-001',
      label: 'G-001',
      name: 'Patient A',
      phone,
      deviceId: 'dev-001',
      source: 'remote',
      status: 'waiting',
      active: true,
      joinedAt: Date.now(),
    });

    expect(ticket1._id).toBeDefined();

    // 2. Creating second active remote ticket with SAME phone and org MUST fail with duplicate key E11000
    let duplicateError = null;
    try {
      await Ticket.create({
        orgId,
        deptKey: 'gen',
        token: 'tok-test-remote-002',
        label: 'G-002',
        name: 'Patient A Again',
        phone,
        deviceId: 'dev-002',
        source: 'remote',
        status: 'waiting',
        active: true,
        joinedAt: Date.now(),
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).not.toBeNull();
    expect(duplicateError.code).toBe(11000);

    // 3. Mark first ticket as 'done' and $unset active
    await Ticket.findByIdAndUpdate(ticket1._id, {
      $set: { status: 'done', doneAt: Date.now() },
      $unset: { active: 1 },
    });

    // 4. Second ticket creation now succeeds!
    const ticket2 = await Ticket.create({
      orgId,
      deptKey: 'gen',
      token: 'tok-test-remote-003',
      label: 'G-003',
      name: 'Patient A New Visit',
      phone,
      deviceId: 'dev-003',
      source: 'remote',
      status: 'waiting',
      active: true,
      joinedAt: Date.now(),
    });

    expect(ticket2._id).toBeDefined();
    expect(ticket2.token).toBe('tok-test-remote-003');
  });

  it('4. Duplicate active remote ticket for same deviceId/org fails with E11000', async () => {
    const deviceId = 'device-shared-xyz-123';
    const orgId = 'lakeside';

    // First ticket on deviceId
    await Ticket.create({
      orgId,
      deptKey: 'gen',
      token: 'tok-dev-test-001',
      label: 'G-010',
      name: 'Dev Patient 1',
      phone: '+919999900001',
      deviceId,
      source: 'remote',
      status: 'waiting',
      active: true,
      joinedAt: Date.now(),
    });

    // Second ticket on same deviceId fails
    let devError = null;
    try {
      await Ticket.create({
        orgId,
        deptKey: 'gen',
        token: 'tok-dev-test-002',
        label: 'G-011',
        name: 'Dev Patient 2',
        phone: '+919999900002',
        deviceId,
        source: 'remote',
        status: 'waiting',
        active: true,
        joinedAt: Date.now(),
      });
    } catch (err) {
      devError = err;
    }

    expect(devError).not.toBeNull();
    expect(devError.code).toBe(11000);
  });

  it('5. resetToSeed() removes admin-created org, restores stats, and runs in < 3 s', async () => {
    // Create an admin-created custom org
    const customOrgId = 'custom-admin-org-99';
    await Org.create({
      _id: customOrgId,
      name: 'Ad-hoc Clinic',
      category: 'hospital',
      demo: true,
      seeded: false,
      lat: 13.05,
      lng: 80.25,
      area: 'T. Nagar',
      address: '77 Pondy Bazaar',
      staffPinHash: 'fakehash',
    });

    await Department.create({
      orgId: customOrgId,
      key: 'opd',
      name: 'OPD',
      code: 'O',
      defaultMin: 15,
    });

    // Mutate Harbour Eye stats
    await Department.findOneAndUpdate(
      { orgId: 'harbour', key: 'eye' },
      { $set: { 'stats.n': 50, 'stats.mean': 45.0 } }
    );

    // Verify custom org exists
    const beforeCount = await Org.countDocuments({ _id: customOrgId });
    expect(beforeCount).toBe(1);

    // Execute resetToSeed()
    const resetResult = await resetToSeed();

    expect(resetResult.success).toBe(true);
    expect(resetResult.durationMs).toBeLessThan(3000);

    // Custom org was removed
    const afterCount = await Org.countDocuments({ _id: customOrgId });
    expect(afterCount).toBe(0);

    // Harbour Eye stats restored to initial seed
    const restoredEye = await Department.findOne({ orgId: 'harbour', key: 'eye' });
    expect(restoredEye.stats.n).toBe(2);
    expect(restoredEye.stats.mean).toBe(24.0);

    // All 3 seeded hospitals remain
    const remainingOrgs = await Org.countDocuments();
    expect(remainingOrgs).toBe(3);
  });
});
