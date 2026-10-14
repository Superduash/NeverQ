// backend/src/routes/admin.js
// Admin-authenticated endpoints (Phase 3 + Phase 8 + Phase 9)
// All non-login routes require requireAdmin middleware (JWT)

import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import { requireAdmin, signAdminToken } from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { Org, Department, Counter, Ticket, Settings } from '../db/models/index.js';
import { clock, now } from '../lib/clock.js';
import { resetToSeed } from '../db/seed.js';
import { sweepAll, sweepDepartment } from '../services/queue/sweep.js';
import {
  generateTicketToken,
  generateTicketLabel,
  generateUrgentLabel,
  calculateSortKey,
} from '../services/queue/helpers.js';
import { recomputeAndLog } from '../services/eta/recompute.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// ───────────── Auth ─────────────

// POST /api/admin/login
router.post(
  '/login',
  adminLoginLimiter,
  validate(
    z.object({
      password: z.string().min(1),
    })
  ),
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const adminPass = env.ADMIN_PASSWORD || 'admin1234';

      const passHash = crypto.createHash('sha256').update(password).digest();
      const expectedHash = crypto.createHash('sha256').update(adminPass).digest();
      const isValid = crypto.timingSafeEqual(passHash, expectedHash);

      if (!isValid) {
        return res.status(401).json({
          status: 401,
          code: 'INVALID_PASSWORD',
          message: 'Incorrect admin password.',
        });
      }

      const token = await signAdminToken();
      res.json({ token, admin: { role: 'admin' } });
    } catch (err) {
      next(err);
    }
  }
);

// ───────────── Platform Summary (§8.5) ─────────────

// GET /api/admin/summary
router.get('/summary', requireAdmin, async (req, res, next) => {
  try {
    const [totalHospitals, totalCounters, activeTickets] = await Promise.all([
      Org.countDocuments(),
      Counter.countDocuments(),
      Ticket.countDocuments({ status: { $in: ['waiting', 'called', 'serving'] } }),
    ]);

    const rushFactor = clock.getRushFactor();
    const demoClockOffsetMinutes = Math.round(clock.getOffsetMs() / 60000);

    res.json({
      totalHospitals,
      totalOrgs: totalHospitals,
      totalCounters,
      activeTickets,
      rushFactor,
      demoClockOffsetMinutes,
      offsetMinutes: demoClockOffsetMinutes,
    });
  } catch (err) {
    next(err);
  }
});

// ───────────── Org CRUD (§8.2, §8.3) ─────────────

// GET /api/admin/orgs
router.get('/orgs', requireAdmin, async (req, res, next) => {
  try {
    const orgs = await Org.find().lean();
    const result = await Promise.all(
      orgs.map(async (org) => {
        const depts = await Department.find({ orgId: org._id }).sort({ order: 1 }).lean();
        const deptsWithCounters = await Promise.all(
          depts.map(async (d) => {
            const counters = await Counter.find({ orgId: org._id, deptKey: d.key }).lean();
            return {
              id: d.key,
              name: d.name,
              code: d.code,
              defaultMin: d.defaultMin,
              counters: counters.map((c) => ({
                id: c._id,
                name: c.name,
                state: c.state,
                currentTicketId: c.currentTicketId,
                delayUntil: c.delayUntil,
                delayReason: c.delayReason,
              })),
            };
          })
        );

        return {
          id: org._id,
          name: org.name,
          category: org.category,
          demo: Boolean(org.demo),
          seeded: Boolean(org.seeded),
          lat: org.lat,
          lng: org.lng,
          area: org.area,
          address: org.address,
          hours: org.hours,
          open: org.open !== false,
          rules: org.rules,
          departments: deptsWithCounters,
        };
      })
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/orgs
router.post('/orgs', requireAdmin, async (req, res, next) => {
  try {
    const {
      name,
      lat,
      lng,
      area = 'Chennai',
      address,
      hours = '8:00 AM – 8:00 PM',
      staffPin = '1234',
      rules,
      departments,
    } = req.body;

    if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
      return next(new AppError('VALIDATION_ERROR', 400, 'Name, latitude, and longitude are required.'));
    }

    const orgId = req.body.id || `org-${Date.now().toString(36)}`;
    const staffPinHash = await bcrypt.hash(staffPin, 10);

    const org = await Org.create({
      _id: orgId,
      name: name.trim(),
      category: 'hospital',
      demo: true,
      seeded: false,
      lat,
      lng,
      area: area.trim(),
      address: address ? address.trim() : `${area}, Chennai`,
      hours: hours.trim(),
      staffPinHash,
      open: req.body.open !== false,
      rules: {
        priorityCreditMin: rules?.priorityCreditMin || { senior: 20, pregnant: 20, disabled: 20, none: 0 },
        arriveByMin: Number(rules?.arriveByMin) || 15,
        graceMin: Number(rules?.graceMin) || 5,
        remoteCap: Number(rules?.remoteCap) || 10,
        remoteEnabled: rules?.remoteEnabled !== false,
      },
    });

    // Create Departments and Desks
    const deptsToCreate = departments && departments.length > 0
      ? departments
      : [
          {
            id: 'gen',
            name: 'General OPD',
            code: 'G',
            defaultMin: 12,
            counters: [
              { id: `${orgId}-c1`, name: 'Consultation Desk 1' },
              { id: `${orgId}-c2`, name: 'Consultation Desk 2' },
            ],
          },
        ];

    for (let i = 0; i < deptsToCreate.length; i++) {
      const d = deptsToCreate[i];
      const deptKey = d.id || `dept-${i + 1}`;
      await Department.create({
        orgId,
        key: deptKey,
        name: d.name || 'General OPD',
        code: d.code || 'G',
        defaultMin: Number(d.defaultMin) || 12,
        order: i + 1,
        stats: { n: 5, mean: Number(d.defaultMin) || 12, m2: 5 },
      });

      const counters = d.counters || [{ id: `${orgId}-${deptKey}-1`, name: 'Desk 1' }];
      for (const c of counters) {
        await Counter.create({
          _id: c.id || `${orgId}-${deptKey}-${Date.now().toString(36)}`,
          orgId,
          deptKey,
          name: c.name || 'Desk',
          state: 'open',
        });
      }
    }

    res.status(201).json({ id: org._id, org });
  } catch (err) {
    next(err);
  }
});

// PUT & PATCH /api/admin/orgs/:id
const updateOrgHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const org = await Org.findById(id);
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }

    const { name, lat, lng, area, address, hours, staffPin, open, rules } = req.body;

    if (staffPin && staffPin.trim()) {
      org.staffPinHash = await bcrypt.hash(staffPin.trim(), 10);
      org.pinVersion = (org.pinVersion || 1) + 1;
    }

    if (name !== undefined) org.name = name.trim();
    if (lat !== undefined) org.lat = Number(lat);
    if (lng !== undefined) org.lng = Number(lng);
    if (area !== undefined) org.area = area.trim();
    if (address !== undefined) org.address = address.trim();
    if (hours !== undefined) org.hours = hours.trim();
    if (open !== undefined) org.open = Boolean(open);
    if (rules !== undefined) {
      org.rules = {
        ...org.rules,
        ...rules,
      };
    }

    await org.save();
    res.json(org);
  } catch (err) {
    next(err);
  }
};

router.put('/orgs/:id', requireAdmin, updateOrgHandler);
router.patch('/orgs/:id', requireAdmin, updateOrgHandler);

// POST /api/admin/orgs/:id/toggle & /toggle-open
const toggleOrgHandler = async (req, res, next) => {
  try {
    const org = await Org.findById(req.params.id);
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }
    org.open = !org.open;
    await org.save();
    res.json({ id: org._id, open: org.open, org });
  } catch (err) {
    next(err);
  }
};

router.post('/orgs/:id/toggle', requireAdmin, toggleOrgHandler);
router.post('/orgs/:id/toggle-open', requireAdmin, toggleOrgHandler);

// DELETE /api/admin/orgs/:id
router.delete('/orgs/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const org = await Org.findById(id);
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }

    // Protect seeded demo hospitals (§2.4)
    if (org.seeded && org.demo) {
      return next(
        new AppError(
          'CANNOT_DELETE_SEEDED',
          400,
          'Seeded demo hospitals cannot be deleted. You can close the facility instead.'
        )
      );
    }

    await Promise.all([
      Org.findByIdAndDelete(id),
      Department.deleteMany({ orgId: id }),
      Counter.deleteMany({ orgId: id }),
      Ticket.deleteMany({ orgId: id }),
    ]);

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ───────────── Demo Director (Phase 9) ─────────────

// Only available when DEMO_MODE=true
function demoOnly(req, res, next) {
  if (env.DEMO_MODE !== true && process.env.DEMO_MODE !== 'true') {
    return next(new AppError('FORBIDDEN', 403, 'Demo Director is disabled in this environment.'));
  }
  next();
}

// POST /api/admin/demo/reset
router.post('/demo/reset', requireAdmin, demoOnly, async (req, res, next) => {
  try {
    clock.reset();
    const result = await resetToSeed();
    await sweepAll();
    res.json({ ok: true, message: 'Demo reset complete', durationMs: result.durationMs });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/demo/fast-forward
router.post(
  '/demo/fast-forward',
  requireAdmin,
  demoOnly,
  validate(
    z.object({
      minutes: z.number().int().min(1).max(360),
    })
  ),
  async (req, res, next) => {
    try {
      const { minutes } = req.body;
      clock.forwardMs(minutes * 60000);
      await sweepAll();

      res.json({
        clockOffsetMs: clock.getOffsetMs(),
        offsetMinutes: Math.round(clock.getOffsetMs() / 60000),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/demo/clock & /set-clock
const setClockHandler = async (req, res, next) => {
  try {
    const offsetMinutes = Number(req.body.offsetMinutes) || 0;
    clock.setOffsetMs(offsetMinutes * 60000);
    await sweepAll();

    res.json({
      clockOffsetMs: clock.getOffsetMs(),
      offsetMinutes,
    });
  } catch (err) {
    next(err);
  }
};

router.post('/demo/clock', requireAdmin, demoOnly, setClockHandler);
router.post('/demo/set-clock', requireAdmin, demoOnly, setClockHandler);

// POST /api/admin/demo/rush-hour
router.post(
  '/demo/rush-hour',
  requireAdmin,
  demoOnly,
  validate(
    z.object({
      factor: z.number().min(0.5).max(3.0),
    })
  ),
  async (req, res, next) => {
    try {
      const { factor } = req.body;
      clock.setRushFactor(factor);
      res.json({ rushFactor: factor });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/demo/simulate & /simulate-patients
const simulateHandler = async (req, res, next) => {
  try {
    const { orgId = 'harbour', deptId = 'gen', count = 5 } = req.body;
    const org = await Org.findById(orgId);
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }

    const dept = await Department.findOne({ orgId, key: deptId });
    if (!dept) {
      return next(new AppError('NOT_FOUND', 404, 'Department not found.'));
    }

    const priorities = ['none', 'none', 'senior', 'pregnant', 'none', 'disabled'];
    const names = [
      'Aakash R.', 'Sunita P.', 'Karthik V.', 'Meera S.',
      'Daniel K.', 'Fatima Z.', 'Murugan T.', 'Deepa N.',
    ];

    const currentTime = now();
    const createdTickets = [];

    for (let i = 0; i < count; i++) {
      const { label } = await generateTicketLabel(orgId, deptId);
      const token = generateTicketToken();
      const priority = priorities[i % priorities.length];
      const isArrived = i % 2 === 0;
      const joinedAt = currentTime - (count - i) * 2 * 60000;
      const sortKey = calculateSortKey(joinedAt, priority, 0, null, org.rules);

      const ticket = await Ticket.create({
        orgId,
        deptKey: deptId,
        token,
        label,
        name: names[i % names.length],
        phone: '',
        deviceId: 'sim',
        source: 'walkin',
        priority,
        status: 'waiting',
        active: true,
        arrived: isArrived,
        arrivedAt: isArrived ? joinedAt : null,
        arrivedVia: isArrived ? 'walkin' : null,
        lateCount: 0,
        joinedAt,
        sortKey,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      createdTickets.push(ticket);
    }

    await recomputeAndLog(orgId, deptId, 'join');
    sweepDepartment(orgId, deptId).catch(() => {});

    res.json({ simulated: createdTickets.length, tickets: createdTickets });
  } catch (err) {
    next(err);
  }
};

router.post('/demo/simulate', requireAdmin, demoOnly, simulateHandler);
router.post('/demo/simulate-patients', requireAdmin, demoOnly, simulateHandler);

// POST /api/admin/demo/scenario
router.post('/demo/scenario', requireAdmin, demoOnly, async (req, res, next) => {
  try {
    const { type, orgId = 'harbour', deptId = 'gen' } = req.body;
    const currentTime = now();

    if (type === 'delay') {
      const counter = await Counter.findOne({ orgId, deptKey: deptId });
      if (counter) {
        counter.delayUntil = currentTime + 15 * 60000;
        counter.delayReason = 'Emergency consultation';
        await counter.save();
        await recomputeAndLog(orgId, deptId, 'delay_set', {
          counter: counter.name,
          minutes: 15,
          reason: 'Emergency consultation',
        });
      }
    } else if (type === 'open-counter' || type === 'open-c2') {
      const counter = await Counter.findOne({ orgId, deptKey: deptId, state: { $ne: 'open' } })
        || await Counter.findOne({ orgId, deptKey: deptId });
      if (counter) {
        counter.state = 'open';
        counter.delayUntil = null;
        await counter.save();
        await recomputeAndLog(orgId, deptId, 'counter_open', { counter: counter.name });
      }
    } else if (type === 'urgent') {
      const { label } = await generateUrgentLabel(orgId, deptId);
      const token = generateTicketToken();
      await Ticket.create({
        orgId,
        deptKey: deptId,
        token,
        label,
        name: 'Triage Patient',
        phone: '',
        deviceId: 'sim',
        source: 'urgent',
        urgent: true,
        urgentAt: currentTime,
        urgentReason: 'Critical breathlessness',
        priority: 'none',
        status: 'waiting',
        active: true,
        arrived: true,
        arrivedAt: currentTime,
        arrivedVia: 'walkin',
        lateCount: 0,
        joinedAt: currentTime,
        sortKey: currentTime,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await recomputeAndLog(orgId, deptId, 'urgent', { count: 1 });
    } else if (type === 'no-show') {
      const { label } = await generateTicketLabel(orgId, deptId);
      const token = generateTicketToken();
      await Ticket.create({
        orgId,
        deptKey: deptId,
        token,
        label,
        name: 'Absent Patient',
        phone: '+919888800000',
        deviceId: 'sim-noshow',
        source: 'remote',
        priority: 'none',
        status: 'waiting',
        active: true,
        arrived: false,
        lateCount: 0,
        joinedAt: currentTime - 20 * 60000,
        sortKey: currentTime - 20 * 60000,
        arriveDeadline: currentTime - 1000, // Past deadline
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await sweepDepartment(orgId, deptId);
    } else if (type === 'story-setup') {
      const dept = await Department.findOne({ orgId: 'harbour', key: 'eye' });
      if (dept) {
        dept.stats = { n: 2, mean: 24, m2: 12 };
        await dept.save();
      }
    }

    sweepDepartment(orgId, deptId).catch(() => {});
    res.json({ success: true, scenario: type });
  } catch (err) {
    next(err);
  }
});

export default router;
