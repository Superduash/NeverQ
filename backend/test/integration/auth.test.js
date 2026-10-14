// backend/test/integration/auth.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/db/connect.js';
import { seedIfEmpty, resetToSeed } from '../../src/db/seed.js';
import { Org, Counter, Ticket } from '../../src/db/models/index.js';
import env from '../../src/config/env.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  app = createApp();
  await seedIfEmpty();
}, 20000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await resetToSeed();
});

describe('Phase 3: Authentication and Permissions', () => {
  describe('3.1 Staff Login (POST /api/staff/login)', () => {
    it('succeeds with seeded org and PIN, returning valid JWT and metadata', async () => {
      const res = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '1234' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.orgId).toBe('harbour');
      expect(res.body.orgName).toBe('Harbour Care Clinic');
      expect(res.body.staff).toEqual({
        orgId: 'harbour',
        name: 'Staff',
        role: 'staff',
      });

      // Verify JWT payload
      const decoded = jwt.verify(res.body.token, env.JWT_SECRET);
      expect(decoded.role).toBe('staff');
      expect(decoded.orgId).toBe('harbour');
      expect(decoded.pv).toBe(1);
      expect(decoded.te).toBeDefined();
    });

    it('fails with 401 INVALID_PIN on incorrect PIN', async () => {
      const res = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '9999' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_PIN');
      expect(res.body.message).toBe('Invalid hospital or staff PIN.');
      expect(res.body.token).toBeUndefined();
    });

    it('fails with 401 INVALID_PIN on unknown orgId without leaking existence', async () => {
      const res = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'nonexistent-clinic', pin: '1234' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_PIN');
      expect(res.body.message).toBe('Invalid hospital or staff PIN.');
    });

    it('rejects malformed payloads with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/staff/login')
        .send({ orgId: '', pin: '12' }); // pin too short

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('enforces rate limit: 10 attempts in 10 min, 11th returns 429 RATE_LIMIT', async () => {
      // Perform 10 failed attempts with rate limiting header enabled
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/staff/login')
          .set('x-test-rate-limit', 'true')
          .send({ orgId: 'harbour-rate-limit-test', pin: '0000' });
        expect(res.status).toBe(401);
      }

      // 11th attempt must be rejected with 429 RATE_LIMIT
      const limitedRes = await request(app)
        .post('/api/staff/login')
        .set('x-test-rate-limit', 'true')
        .send({ orgId: 'harbour-rate-limit-test', pin: '0000' });

      expect(limitedRes.status).toBe(429);
      expect(limitedRes.body.code).toBe('RATE_LIMIT');
      expect(limitedRes.body.retryAfterMs).toBeDefined();
    });
  });

  describe('3.2 Admin Login (POST /api/admin/login)', () => {
    it('succeeds with valid admin password', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ password: env.ADMIN_PASSWORD || 'admin1234' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.admin).toEqual({ role: 'admin' });

      const decoded = jwt.verify(res.body.token, env.JWT_SECRET);
      expect(decoded.role).toBe('admin');
      expect(decoded.te).toBeDefined();
    });

    it('fails with 401 INVALID_PASSWORD on incorrect password', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_PASSWORD');
      expect(res.body.message).toBe('Incorrect admin password.');
    });
  });

  describe('3.3 Role Isolation & Route Access Control', () => {
    it('rejects unauthenticated requests to staff routes with 401 AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/staff/queue');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('rejects unauthenticated requests to admin routes with 401 AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/admin/orgs');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('forbids admin token on staff routes with 403 FORBIDDEN', async () => {
      const adminLogin = await request(app)
        .post('/api/admin/login')
        .send({ password: env.ADMIN_PASSWORD || 'admin1234' });

      const res = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', `Bearer ${adminLogin.body.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('forbids staff token on admin routes with 403 FORBIDDEN', async () => {
      const staffLogin = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '1234' });

      const res = await request(app)
        .get('/api/admin/orgs')
        .set('Authorization', `Bearer ${staffLogin.body.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('3.4 Org Scoping Rule', () => {
    it('returns 404 NOT_FOUND (never 403) when staff accesses counter belonging to another hospital', async () => {
      // Harbour staff logs in
      const staffLogin = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '1234' });
      const harbourToken = staffLogin.body.token;

      // Find a counter belonging to Lakeside
      const lakesideCounter = await Counter.findOne({ orgId: 'lakeside' });
      expect(lakesideCounter).toBeDefined();

      // Harbour staff attempts to call-next on Lakeside counter
      const res = await request(app)
        .post(`/api/staff/counters/${lakesideCounter._id}/call-next`)
        .set('Authorization', `Bearer ${harbourToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('3.5 PIN Rotation Invalidation', () => {
    it('immediately invalidates existing staff tokens when hospital PIN is updated', async () => {
      // 1. Staff logs in with original PIN
      const loginRes = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '1234' });
      const activeToken = loginRes.body.token;

      // Verify token works
      const testRes = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', `Bearer ${activeToken}`);
      expect(testRes.status).toBe(200);

      // 2. Admin logs in and updates Harbour PIN
      const adminLogin = await request(app)
        .post('/api/admin/login')
        .send({ password: env.ADMIN_PASSWORD || 'admin1234' });

      const patchRes = await request(app)
        .patch('/api/admin/orgs/harbour')
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ staffPin: '5678' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.pinVersion).toBe(2);

      // 3. Old staff token now fails immediately with 401 AUTH_REQUIRED
      const oldTokenRes = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', `Bearer ${activeToken}`);
      expect(oldTokenRes.status).toBe(401);
      expect(oldTokenRes.body.code).toBe('AUTH_REQUIRED');
      expect(oldTokenRes.body.message).toContain('Staff PIN has changed');

      // 4. Staff logs in with new PIN
      const newLoginRes = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '5678' });
      expect(newLoginRes.status).toBe(200);

      const newTokenRes = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', `Bearer ${newLoginRes.body.token}`);
      expect(newTokenRes.status).toBe(200);
    });
  });

  describe('3.6 Data Leakage Prevention (staffPinHash check)', () => {
    it('ensures staffPinHash is never exposed across staff or admin endpoints', async () => {
      // Admin lists all orgs
      const adminLogin = await request(app)
        .post('/api/admin/login')
        .send({ password: env.ADMIN_PASSWORD || 'admin1234' });

      const orgsRes = await request(app)
        .get('/api/admin/orgs')
        .set('Authorization', `Bearer ${adminLogin.body.token}`);

      expect(orgsRes.status).toBe(200);
      expect(Array.isArray(orgsRes.body)).toBe(true);

      for (const org of orgsRes.body) {
        expect(org.staffPinHash).toBeUndefined();
      }

      // Staff login response
      const staffLogin = await request(app)
        .post('/api/staff/login')
        .send({ orgId: 'harbour', pin: '1234' });
      expect(staffLogin.body.staffPinHash).toBeUndefined();
      expect(staffLogin.body.staff.staffPinHash).toBeUndefined();

      // Staff queue response
      const queueRes = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', `Bearer ${staffLogin.body.token}`);
      expect(JSON.stringify(queueRes.body)).not.toContain('staffPinHash');
    });
  });
});
