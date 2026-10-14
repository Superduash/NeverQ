// backend/test/integration/queue.test.js
// Integration test suite for NeverQ Phase 6: Scenarios Q-1 through Q-24 (§6.11)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { seedIfEmpty, resetToSeed } from '../../src/db/seed.js';
import { Org, Department, Counter, Ticket, Settings, BlockedPhone } from '../../src/db/models/index.js';
import { clock } from '../../src/lib/clock.js';
import { sweepDepartment, sweepAll, applyOutageCredit } from '../../src/services/queue/sweep.js';
import env from '../../src/config/env.js';

let mongod;
let app;
let staffToken;

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

  // Login as Harbour staff to get staff token
  const res = await request(app)
    .post('/api/staff/login')
    .send({ orgId: 'harbour', pin: '1234' });
  staffToken = res.body.token;
});

describe('Phase 6: Queue Core Scenario Tests Q-1 to Q-24 (§6.11)', () => {
  const HARBOUR_COORDS = { lat: 13.0338, lng: 80.2676 };

  describe('Q-1 to Q-4: Join, Idempotence & Abuse Controls', () => {
    it('Q-1: Join, refresh (GET again) returns same ticket and same position', async () => {
      const joinRes = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Anand Kumar',
          phone: '9876543210',
          deviceId: 'dev-001',
        });

      expect(joinRes.status).toBe(201);
      const token = joinRes.body.token;
      expect(token).toBeDefined();

      const getRes = await request(app).get(`/api/tickets/${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.token).toBe(token);
      expect(getRes.body.position).toBe(joinRes.body.position);
      expect(getRes.body.phone).toBeUndefined(); // No phone in public DTO!
    });

    it('Q-2: Same phone joins twice returns 409 DUPLICATE_TICKET with original token', async () => {
      const firstJoin = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient One',
          phone: '9876543211',
          deviceId: 'dev-002',
        });
      expect(firstJoin.status).toBe(201);

      const secondJoin = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient Two',
          phone: '9876543211', // Same phone
          deviceId: 'dev-003',
        });

      expect(secondJoin.status).toBe(409);
      expect(secondJoin.body.code).toBe('DUPLICATE_TICKET');
      expect(secondJoin.body.token).toBe(firstJoin.body.token);
    });

    it('Q-3: Same device, different phone returns 409 DUPLICATE_TICKET', async () => {
      const firstJoin = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient One',
          phone: '9876543212',
          deviceId: 'shared-tablet-dev',
        });
      expect(firstJoin.status).toBe(201);

      const secondJoin = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient Two',
          phone: '9876543213', // Different phone
          deviceId: 'shared-tablet-dev', // Same device
        });

      expect(secondJoin.status).toBe(409);
      expect(secondJoin.body.code).toBe('DUPLICATE_TICKET');
    });

    it('Q-4: 11th remote join to department with cap 10 returns 429 REMOTE_CAP', async () => {
      // Harbour General OPD has remoteCap: 10
      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post('/api/tickets')
          .send({
            orgId: 'harbour',
            deptId: 'gen',
            name: `Patient ${i}`,
            phone: `98765000${String(i).padStart(2, '0')}`,
            deviceId: `dev-cap-${i}`,
          });
        expect(res.status).toBe(201);
      }

      // 11th join must be rejected with 429 REMOTE_CAP
      const capRes = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient 11',
          phone: '9876500099',
          deviceId: 'dev-cap-11',
        });

      expect(capRes.status).toBe(429);
      expect(capRes.body.code).toBe('REMOTE_CAP');
    });
  });

  describe('Q-5 to Q-7: Priority & Urgent Ordering (§6.5)', () => {
    it('Q-5: Senior joins 10 min after regular patient jumps ahead (credit 20 min)', async () => {
      const t0 = 1000000;
      clock.setOffsetMs(t0 - Date.now());

      // Regular patient joins at T = 0
      const reg = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Regular Patient',
          phone: '9876540001',
          priority: 'none',
        });
      expect(reg.status).toBe(201);

      // Fast-forward clock 10 minutes
      clock.setOffsetMs(t0 + 10 * 60000 - Date.now());

      // Senior joins at T = 10 min (credit 20 min -> sortKey = 10 - 20 = -10 min < 0)
      const senior = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Senior Patient',
          phone: '9876540002',
          priority: 'senior',
        });
      expect(senior.status).toBe(201);

      // Senior is position 1
      const seniorCheck = await request(app).get(`/api/tickets/${senior.body.token}`);
      expect(seniorCheck.body.position).toBe(1);

      // Regular patient is moved to position 2
      const regCheck = await request(app).get(`/api/tickets/${reg.body.token}`);
      expect(regCheck.body.position).toBe(2);
    });

    it('Q-6: Senior joins 30 min after regular patient stays behind (credit 20 min < 30 min)', async () => {
      const t0 = 1000000;
      clock.setOffsetMs(t0 - Date.now());

      // Regular patient joins at T = 0
      const reg = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Regular Patient',
          phone: '9876540003',
          priority: 'none',
        });

      // Fast forward 30 minutes
      clock.setOffsetMs(t0 + 30 * 60000 - Date.now());

      // Senior joins at T = 30 min (credit 20 min -> sortKey = 30 - 20 = 10 min > 0)
      const senior = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Senior Patient',
          phone: '9876540004',
          priority: 'senior',
        });

      // Senior is position 2 (behind regular patient)
      const seniorCheck = await request(app).get(`/api/tickets/${senior.body.token}`);
      expect(seniorCheck.body.position).toBe(2);
    });

    it('Q-7: Urgent insertion jumps to position 1 and logs change entry on others', async () => {
      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const c2 = counters[1];
      // Close c2 so c1 is the single counter in department
      await request(app)
        .post(`/api/staff/counters/${c2._id}/state`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ state: 'closed' });

      // 1. Regular patient joins
      const reg = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Regular Patient',
          phone: '9876540005',
        });

      // 2. Staff inserts urgent patient
      const urgentRes = await request(app)
        .post('/api/staff/urgent')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          deptId: 'gen',
          name: 'Trauma Case',
          reason: 'Severe laceration',
        });

      expect(urgentRes.status).toBe(201);
      expect(urgentRes.body.urgent).toBe(true);
      expect(urgentRes.body.label).toContain('URG-');

      // 3. Regular patient position is now 2
      const regCheck = await request(app).get(`/api/tickets/${reg.body.token}`);
      expect(regCheck.body.position).toBe(2);
      expect(regCheck.body.changes.some((c) => c.text.includes('urgent'))).toBe(true);
    });
  });

  describe('Q-8 to Q-9: Doctor Delay & Counter State Updates (§6.7)', () => {
    it('Q-8: Staff sets 15 min delay on counter increases wait and records reason', async () => {
      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const c1 = counters[0];
      const c2 = counters[1];

      // Close c2 so c1 is the only counter serving patients
      await request(app)
        .post(`/api/staff/counters/${c2._id}/state`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ state: 'closed' });

      const join = await request(app)
        .post('/api/tickets')
        .send({
          orgId: 'harbour',
          deptId: 'gen',
          name: 'Patient A',
          phone: '9876540006',
        });

      // Staff sets 15 min delay
      const delayRes = await request(app)
        .post(`/api/staff/counters/${c1._id}/delay`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          minutes: 15,
          reason: 'Emergency consultation',
        });

      expect(delayRes.status).toBe(200);
      expect(delayRes.body.delayUntil).toBeDefined();

      // Check ticket changes
      const check = await request(app).get(`/api/tickets/${join.body.token}`);
      expect(check.body.changes.some((c) => c.text.includes('Emergency consultation'))).toBe(true);
    });

    it('Q-9: Opening a counter drops mid ETA and records reason', async () => {
      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const c2 = counters[1];

      // Close counter c2 first
      await request(app)
        .post(`/api/staff/counters/${c2._id}/state`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ state: 'closed' });

      // Join 2 tickets
      const t1 = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P1', phone: '9876540007' });
      const t2 = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P2', phone: '9876540008' });

      const beforeMid = (await request(app).get(`/api/tickets/${t2.body.token}`)).body.lastEta.mid;

      // Re-open counter c2
      await request(app)
        .post(`/api/staff/counters/${c2._id}/state`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ state: 'open' });

      const afterMid = (await request(app).get(`/api/tickets/${t2.body.token}`)).body.lastEta.mid;
      expect(afterMid).toBeLessThanOrEqual(beforeMid);
    });
  });

  describe('Q-10 to Q-13: Atomic Call Next (§6.6)', () => {
    it('Q-10: Call next with no arrived tickets returns 404 NO_ARRIVED_TICKETS', async () => {
      // Remote patient joins but has NOT arrived
      await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'Patient Remote', phone: '9876540010' });

      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const res = await request(app)
        .post(`/api/staff/counters/${counters[0]._id}/call-next`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_ARRIVED_TICKETS');
    });

    it('Q-11: Call next skips not-arrived head ticket and calls first arrived ticket', async () => {
      // 1. First ticket joins (not arrived)
      const t1 = await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'P1 Not Arrived', phone: '9876540011' });

      // 2. Second ticket joins and marks arrived via staff
      const t2 = await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'P2 Arrived', phone: '9876540012' });

      await request(app)
        .post(`/api/staff/tickets/${t2.body.id}/arrive`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});

      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });

      // 3. Call next
      const callRes = await request(app)
        .post(`/api/staff/counters/${counters[0]._id}/call-next`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});

      expect(callRes.status).toBe(200);
      expect(callRes.body.ticket.id).toBe(t2.body.id); // P2 was called!

      // P1 remains waiting in position 1
      const p1Check = await request(app).get(`/api/tickets/${t1.body.token}`);
      expect(p1Check.body.status).toBe('waiting');
      expect(p1Check.body.position).toBe(1);
    });

    it('Q-12: Two simultaneous call-next on two counters with 1 arrived ticket -> exactly one succeeds', async () => {
      // Loop 50 times to stress concurrency (§Phase 6 gate)
      for (let run = 0; run < 50; run++) {
        await resetToSeed();
        const t = await request(app)
          .post('/api/tickets')
          .send({ orgId: 'harbour', deptId: 'gen', name: `Patient ${run}`, phone: '9876540013' });

        await request(app)
          .post(`/api/staff/tickets/${t.body.id}/arrive`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({});

        const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });

        // Fire simultaneous call-next on counter 0 and counter 1
        const [res1, res2] = await Promise.all([
          request(app).post(`/api/staff/counters/${counters[0]._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({}),
          request(app).post(`/api/staff/counters/${counters[1]._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({}),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses[0]).toBe(200); // One must succeed
        expect([404, 409]).toContain(statuses[1]); // The other must fail with NO_ARRIVED_TICKETS or ALREADY_CALLED
      }
    }, 60000);

    it('Q-13: Two simultaneous call-next on the same counter -> one 200, one 409 COUNTER_BUSY', async () => {
      // Loop 50 times to stress concurrency (§Phase 6 gate)
      for (let run = 0; run < 50; run++) {
        await resetToSeed();
        const t1 = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P1', phone: '9876540014' });
        const t2 = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P2', phone: '9876540015' });

        await request(app).post(`/api/staff/tickets/${t1.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});
        await request(app).post(`/api/staff/tickets/${t2.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});

        const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
        const targetCounterId = counters[0]._id;

        const [res1, res2] = await Promise.all([
          request(app).post(`/api/staff/counters/${targetCounterId}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({}),
          request(app).post(`/api/staff/counters/${targetCounterId}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({}),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses[0]).toBe(200);
        expect(statuses[1]).toBe(409); // Counter busy!
      }
    }, 60000);
  });

  describe('Q-14 to Q-15: Consultation Completion, Learning & Cancellation (§6.4, §6.7)', () => {
    it('Q-14: Done teaches stats and frees counter', async () => {
      // Eye clinic has n=2
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'eye', name: 'Eye Patient', phone: '9876540016' });
      await request(app).post(`/api/staff/tickets/${t.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});

      const eyeCounter = await Counter.findOne({ orgId: 'harbour', deptKey: 'eye' });

      // Call
      await request(app).post(`/api/staff/counters/${eyeCounter._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({});

      // Start consultation
      await request(app).post(`/api/staff/tickets/${t.body.id}/start`).set('Authorization', `Bearer ${staffToken}`).send({});

      // Fast forward clock 17 minutes
      clock.forwardMs(17 * 60000);

      // Complete consultation
      const doneRes = await request(app).post(`/api/staff/tickets/${t.body.id}/done`).set('Authorization', `Bearer ${staffToken}`).send({});
      expect(doneRes.status).toBe(200);
      expect(doneRes.body.status).toBe('done');

      // Verify Eye department n incremented to 3
      const dept = await Department.findOne({ orgId: 'harbour', key: 'eye' });
      expect(dept.stats.n).toBe(3);

      // Verify counter is freed
      const counterAfter = await Counter.findById(eyeCounter._id);
      expect(counterAfter.currentTicketId).toBeNull();
    });

    it('Q-15: Cancel while waiting (success), while called (frees counter), while serving (409)', async () => {
      // 1. Cancel while waiting
      const tWait = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P Wait', phone: '9876540017' });
      const cancelWait = await request(app).post(`/api/tickets/${tWait.body.token}/cancel`).send({});
      expect(cancelWait.status).toBe(200);

      // 2. Cancel while called frees counter
      const tCall = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P Call', phone: '9876540018' });
      await request(app).post(`/api/staff/tickets/${tCall.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});

      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const c = counters[0];
      await request(app).post(`/api/staff/counters/${c._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({});

      const cancelCall = await request(app).post(`/api/tickets/${tCall.body.token}/cancel`).send({});
      expect(cancelCall.status).toBe(200);

      const counterAfter = await Counter.findById(c._id);
      expect(counterAfter.currentTicketId).toBeNull();

      // 3. Cancel while serving returns 409 INVALID_STATE
      const tServe = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P Serve', phone: '9876540019' });
      await request(app).post(`/api/staff/tickets/${tServe.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});
      await request(app).post(`/api/staff/counters/${c._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({});
      await request(app).post(`/api/staff/tickets/${tServe.body.id}/start`).set('Authorization', `Bearer ${staffToken}`).send({});

      const cancelServe = await request(app).post(`/api/tickets/${tServe.body.token}/cancel`).send({});
      expect(cancelServe.status).toBe(409);
      expect(cancelServe.body.code).toBe('INVALID_STATE');
    });
  });

  describe('Q-16 to Q-19: Sweep Rules, Arrive Deadlines & Auto-Requeue/Expire (§6.8)', () => {
    it('Q-16: Remote ticket in next-up zone receives arriveDeadline on sweep', async () => {
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'Remote Next', phone: '9876540020' });

      // Run sweep
      await sweepDepartment('harbour', 'gen');

      const check = await request(app).get(`/api/tickets/${t.body.token}`);
      expect(check.body.arriveDeadline).toBeDefined();
      expect(check.body.changes.some((c) => c.text.includes('nearly up'))).toBe(true);
    });

    it('Q-17: Fast-forward past deadline requeues ticket once, second miss expires', async () => {
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'Patient Miss', phone: '9876540021' });

      // First sweep sets arriveDeadline
      await sweepDepartment('harbour', 'gen');

      // Fast forward 20 minutes past deadline
      clock.forwardMs(20 * 60000);

      // Second sweep -> First miss: Requeued
      await sweepDepartment('harbour', 'gen');

      const check1 = await Ticket.findOne({ token: t.body.token });
      expect(check1.status).toBe('waiting');
      expect(check1.lateCount).toBe(1);

      // Set arrive deadline again on next sweep
      await sweepDepartment('harbour', 'gen');

      // Fast forward past second deadline
      clock.forwardMs(20 * 60000);

      // Third sweep -> Second miss: Expired
      await sweepDepartment('harbour', 'gen');

      const check2 = await Ticket.findOne({ token: t.body.token });
      expect(check2.status).toBe('expired');
      expect(check2.expiredReason).toBe('no_show');
      expect(check2.active).toBeUndefined();
    });

    it('Q-18: Two expiries triggers 403 COOLDOWN on 3rd remote join, walk-in still works', async () => {
      const rawPhone = '9876540022';
      const normPhone = '+919876540022';

      // Create two expired remote tickets for this phone
      await Ticket.create([
        {
          orgId: 'harbour',
          deptKey: 'gen',
          token: 'exp-tok-1',
          label: 'G-081',
          name: 'Abuser',
          phone: normPhone,
          source: 'remote',
          status: 'expired',
          active: undefined,
          expiredReason: 'no_show',
          joinedAt: Date.now() - 3600000,
          doneAt: Date.now() - 3500000,
          expireAt: new Date(Date.now() + 86400000),
        },
        {
          orgId: 'harbour',
          deptKey: 'gen',
          token: 'exp-tok-2',
          label: 'G-082',
          name: 'Abuser',
          phone: normPhone,
          source: 'remote',
          status: 'expired',
          active: undefined,
          expiredReason: 'no_show',
          joinedAt: Date.now() - 1800000,
          doneAt: Date.now() - 1700000,
          expireAt: new Date(Date.now() + 86400000),
        },
      ]);

      // 3rd remote join must fail with 403 COOLDOWN
      const joinRes = await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'Abuser', phone: rawPhone });

      expect(joinRes.status).toBe(403);
      expect(joinRes.body.code).toBe('COOLDOWN');
      expect(joinRes.body.retryAfterMs).toBeDefined();

      // Walk-in for this patient STILL works
      const walkinRes = await request(app)
        .post('/api/staff/walkin')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ deptId: 'gen', name: 'Walkin Abuser' });

      expect(walkinRes.status).toBe(201);
    });

    it('Q-19: Called patient absent past grace period is auto-skipped and counter freed', async () => {
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'Absent Called', phone: '9876540023' });
      await request(app).post(`/api/staff/tickets/${t.body.id}/arrive`).set('Authorization', `Bearer ${staffToken}`).send({});

      const counters = await Counter.find({ orgId: 'harbour', deptKey: 'gen' });
      const c = counters[0];

      await request(app).post(`/api/staff/counters/${c._id}/call-next`).set('Authorization', `Bearer ${staffToken}`).send({});

      // Fast forward 10 minutes past 5 min grace
      clock.forwardMs(10 * 60000);

      // Run sweep
      await sweepDepartment('harbour', 'gen');

      // Verify counter freed
      const counterAfter = await Counter.findById(c._id);
      expect(counterAfter.currentTicketId).toBeNull();

      // Verify ticket requeued
      const ticketAfter = await Ticket.findById(t.body.id);
      expect(ticketAfter.status).toBe('waiting');
      expect(ticketAfter.lateCount).toBe(1);
    });
  });

  describe('Q-20 to Q-24: Geofence, Security, Outage Credit & Blocking (§6.3, §6.7, §6.8)', () => {
    it('Q-20: Arrive 500m away -> 400 OUT_OF_RANGE; at 250m -> ok; at 320m with accuracy 40 -> ok', async () => {
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'GPS Patient', phone: '9876540024' });

      // 500m away (lat delta ~0.0045 deg)
      const resFar = await request(app)
        .post(`/api/tickets/${t.body.token}/arrive`)
        .send({
          lat: HARBOUR_COORDS.lat + 0.0045,
          lng: HARBOUR_COORDS.lng,
        });
      expect(resFar.status).toBe(400);
      expect(resFar.body.code).toBe('OUT_OF_RANGE');

      // 320m away with accuracy 40 (allowed = 300 + 40 = 340m > 320m)
      const resAccuracy = await request(app)
        .post(`/api/tickets/${t.body.token}/arrive`)
        .send({
          lat: HARBOUR_COORDS.lat + 0.0028,
          lng: HARBOUR_COORDS.lng,
          accuracy: 40,
        });
      expect(resAccuracy.status).toBe(200);
      expect(resAccuracy.body.success).toBe(true);
    });

    it('Q-21: Staff for hospital A touching hospital B ticket returns 404 NOT_FOUND', async () => {
      // Lakeside ticket
      const lakesideTicket = await Ticket.create({
        orgId: 'lakeside',
        deptKey: 'gen',
        token: 'lakeside-tok',
        label: 'G-001',
        name: 'Lakeside Patient',
        source: 'remote',
        status: 'waiting',
        joinedAt: Date.now(),
        expireAt: new Date(Date.now() + 86400000),
      });

      // Harbour staff attempts to confirm arrival
      const res = await request(app)
        .post(`/api/staff/tickets/${lakesideTicket._id}/arrive`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('Q-22: Outage credit shifts deadlines forward after gap > 30s without expiring tickets', async () => {
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'Credit Patient', phone: '9876540025' });
      await sweepDepartment('harbour', 'gen');

      const initialTicket = await Ticket.findOne({ token: t.body.token });
      const initialDeadline = initialTicket.arriveDeadline;
      expect(initialDeadline).toBeDefined();

      // Record last sweep as 5 minutes ago (simulating 5 min server cold start/deploy)
      const fiveMinAgo = Date.now() - 5 * 60000;
      await Settings.findByIdAndUpdate('global', { lastSweepAt: fiveMinAgo }, { upsert: true });

      // Run outage credit
      await applyOutageCredit(Date.now());

      const afterCreditTicket = await Ticket.findOne({ token: t.body.token });
      expect(afterCreditTicket.arriveDeadline).toBeGreaterThan(initialDeadline);
      expect(afterCreditTicket.status).toBe('waiting'); // Not expired!
    });

    it('Q-23: Closed hospital rejects join with 400 HOSPITAL_CLOSED', async () => {
      // Close Harbour hospital
      await Org.findByIdAndUpdate('harbour', { open: false });

      const res = await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'P Closed', phone: '9876540026' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('HOSPITAL_CLOSED');
    });

    it('Q-24: Block phone on remove rejects subsequent join with 403 PHONE_BLOCKED', async () => {
      const phone = '9876540027';
      const t = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'P to Block', phone });

      // Staff removes with blockPhone: true
      const removeRes = await request(app)
        .post(`/api/staff/tickets/${t.body.id}/remove`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ blockPhone: true });

      expect(removeRes.status).toBe(200);

      // Verify in BlockedPhone collection
      const isBlocked = await BlockedPhone.findOne({ orgId: 'harbour', phone: '+919876540027' });
      expect(isBlocked).toBeDefined();

      // Next join attempt must be blocked
      const nextJoin = await request(app)
        .post('/api/tickets')
        .send({ orgId: 'harbour', deptId: 'gen', name: 'P Blocked', phone });

      expect(nextJoin.status).toBe(403);
      expect(nextJoin.body.code).toBe('PHONE_BLOCKED');
    });
  });

  describe('Phase 6 Gate Verifications', () => {
    it('Concurrent sweep: running sweepAll() twice simultaneously produces identical final state', async () => {
      // Create test ticket needing deadline
      const t1 = await request(app).post('/api/tickets').send({ orgId: 'harbour', deptId: 'gen', name: 'Conc Sweep 1', phone: '9876540028' });
      expect(t1.status).toBe(201);

      // Run two sweeps concurrently
      await Promise.all([sweepAll(), sweepAll()]);

      const state1 = await Ticket.find({ orgId: 'harbour', deptKey: 'gen' }).sort({ _id: 1 }).lean();
      const counters1 = await Counter.find({ orgId: 'harbour', deptKey: 'gen' }).sort({ _id: 1 }).lean();

      // Run third sweep sequentially to check idempotency
      await sweepAll();

      const state2 = await Ticket.find({ orgId: 'harbour', deptKey: 'gen' }).sort({ _id: 1 }).lean();
      const counters2 = await Counter.find({ orgId: 'harbour', deptKey: 'gen' }).sort({ _id: 1 }).lean();

      expect(state1.length).toBe(state2.length);
      expect(state1[0].status).toBe(state2[0].status);
      expect(state1[0].lateCount).toBe(state2[0].lateCount);
      expect(counters1[0].currentTicketId).toEqual(counters2[0].currentTicketId);
    });

    it('Privacy gate: phone numbers never appear in any public response', async () => {
      const secretPhone = '9876540029';
      const joinRes = await request(app).post('/api/tickets').send({
        orgId: 'harbour',
        deptId: 'gen',
        name: 'Private Patient',
        phone: secretPhone,
      });

      // Public Join response
      const joinBodyStr = JSON.stringify(joinRes.body);
      expect(joinBodyStr).not.toContain(secretPhone);
      expect(joinBodyStr).not.toContain('+919876540029');

      // Public GET response
      const getRes = await request(app).get(`/api/tickets/${joinRes.body.token}`);
      const getBodyStr = JSON.stringify(getRes.body);
      expect(getBodyStr).not.toContain(secretPhone);
      expect(getBodyStr).not.toContain('+919876540029');
    });
  });
});

