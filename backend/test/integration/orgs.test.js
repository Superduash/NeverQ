// backend/test/integration/orgs.test.js
// Integration test suite for Public Org read endpoints and Admin Org Management

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { seedIfEmpty, resetToSeed } from '../../src/db/seed.js';
import { Org, Counter, Ticket } from '../../src/db/models/index.js';
import { clock } from '../../src/lib/clock.js';
import env from '../../src/config/env.js';

let mongod;
let app;
let adminToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  app = createApp();
  await seedIfEmpty();
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  clock.reset();
  await resetToSeed();

  // Login as admin
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: env.ADMIN_PASSWORD });
  adminToken = res.body.token;
});

describe('Phase 7: Public Org Endpoints & Parity', () => {
  it('GET /api/orgs returns list of seeded hospitals with departments and travel estimates', async () => {
    const res = await request(app)
      .get('/api/orgs')
      .query({ lat: 13.045, lng: 80.245 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const harbour = res.body.find((o) => o.id === 'harbour');
    expect(harbour).toBeDefined();
    expect(harbour.name).toBe('Harbour Care Clinic');
    expect(harbour.distanceKm).toBeGreaterThan(0);
    expect(harbour.travelMin).toBeGreaterThan(0);
    expect(harbour.departments.length).toBeGreaterThan(0);

    const gen = harbour.departments.find((d) => d.id === 'gen');
    expect(gen).toBeDefined();
    expect(gen.countersTotal).toBeGreaterThan(0);
    expect(typeof gen.waitingCount).toBe('number');
  });

  it('GET /api/orgs/:id returns hospital details', async () => {
    const res = await request(app).get('/api/orgs/harbour');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('harbour');
    expect(res.body.name).toBe('Harbour Care Clinic');
    expect(res.body.open).toBe(true);
  });

  it('GET /api/orgs/:id returns 404 for unknown hospital', async () => {
    const res = await request(app).get('/api/orgs/nonexistent-xyz');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('GET /api/orgs/:id/board returns public wait board without PII', async () => {
    const res = await request(app).get('/api/orgs/harbour/board');
    expect(res.status).toBe(200);
    expect(res.body.org.id).toBe('harbour');
    expect(Array.isArray(res.body.departments)).toBe(true);

    const genDept = res.body.departments.find((d) => d.id === 'gen');
    expect(genDept).toBeDefined();
    expect(Array.isArray(genDept.counters)).toBe(true);
    expect(Array.isArray(genDept.waiting)).toBe(true);

    // Verify zero PII in waiting tickets
    for (const ticket of genDept.waiting) {
      expect(ticket.phone).toBeUndefined();
      expect(ticket.name).toBeUndefined();
      expect(ticket.label).toBeDefined();
    }
  });

  it('Admin toggle open/close hospital updates facility open state', async () => {
    // Toggle close harbour
    const toggleRes = await request(app)
      .post('/api/admin/orgs/harbour/toggle-open')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.open).toBe(false);

    // Public detail reflects open: false
    const detailRes = await request(app).get('/api/orgs/harbour');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.open).toBe(false);

    // Reopen harbour
    const reopenRes = await request(app)
      .post('/api/admin/orgs/harbour/toggle')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.open).toBe(true);
  });

  it('Admin delete protects seeded hospitals but permits deleting created hospitals', async () => {
    // Attempting to delete seeded hospital 'harbour' must fail with 400
    const failRes = await request(app)
      .delete('/api/admin/orgs/harbour')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(failRes.status).toBe(400);
    expect(failRes.body.code).toBe('CANNOT_DELETE_SEEDED');

    // Create a new facility
    const createRes = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: 'clinic-temporary',
        name: 'Temporary Clinic',
        category: 'clinic',
        lat: 13.08,
        lng: 80.28,
        area: 'Egmore',
        address: '10 Egmore High Rd',
        staffPin: '5678',
        departments: [{ key: 'gen', name: 'General', code: 'G', defaultMin: 10, counters: ['Desk 1'] }],
      });

    expect(createRes.status).toBe(201);

    // Delete custom facility succeeds
    const deleteRes = await request(app)
      .delete('/api/admin/orgs/clinic-temporary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Confirm it is deleted
    const checkRes = await request(app).get('/api/orgs/clinic-temporary');
    expect(checkRes.status).toBe(404);
  });
});
