// NeverQ Stateful Mock Engine (NeverQ2 §3, §4, §9, §11)
// In-memory implementation of queues, counters, ETA simulation with learning (K=3),
// priority credits, arrive-by deadlines, sweep, and localStorage persistence.

import { haversine, estimateTravel } from '../geo.js';

const STORAGE_KEY = 'nq-mock-db-v2';

// ───────────── Seed Data ─────────────
const SEED_ORGS = [
  {
    id: 'harbour',
    name: 'Harbour Care Clinic',
    category: 'hospital',
    demo: true,
    lat: 13.0338,
    lng: 80.2676,
    area: 'Mylapore',
    address: '42 Luz Church Road, Mylapore, Chennai 600004',
    hours: '8:00 AM – 8:00 PM',
    staffPin: '1234',
    rules: {
      priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
      arriveByMin: 15,
      graceMin: 5,
      remoteCap: 10,
      remoteEnabled: true,
    },
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        defaultMin: 12,
        stats: { n: 5, mean: 13.5, m2: 8.2 },
        seq: 14,
        counters: [
          { id: 'c1', name: 'Room 1 — Dr. Ananya', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c2', name: 'Room 2 — Dr. Raman', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'eye',
        name: 'Eye Clinic',
        defaultMin: 22,
        stats: { n: 2, mean: 24.0, m2: 12.0 },
        seq: 9,
        counters: [
          { id: 'c3', name: 'Optometry Room 1', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'pharm',
        name: 'Pharmacy',
        defaultMin: 5,
        stats: { n: 12, mean: 4.8, m2: 2.1 },
        seq: 31,
        counters: [
          { id: 'c4', name: 'Dispensing Counter 1', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c5', name: 'Dispensing Counter 2', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
    ],
  },
  {
    id: 'lakeside',
    name: 'Lakeside General Hospital',
    category: 'hospital',
    demo: true,
    lat: 13.0850,
    lng: 80.2101,
    area: 'Anna Nagar',
    address: '15 2nd Avenue, Anna Nagar East, Chennai 600102',
    hours: '24 Hours Emergency & OPD',
    staffPin: '1234',
    rules: {
      priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
      arriveByMin: 15,
      graceMin: 5,
      remoteCap: 10,
      remoteEnabled: true,
    },
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        defaultMin: 10,
        stats: { n: 8, mean: 10.2, m2: 5.1 },
        seq: 22,
        counters: [
          { id: 'c6', name: 'OPD Desk 1 — Dr. Priya', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c7', name: 'OPD Desk 2 — Dr. Joseph', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c8', name: 'OPD Desk 3 — Dr. Vikram', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'eye',
        name: 'Eye Clinic',
        defaultMin: 8,
        stats: { n: 14, mean: 7.5, m2: 3.2 },
        seq: 18,
        counters: [
          { id: 'c9', name: 'Vision Testing — Dr. Meera', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c10', name: 'Ophthalmology Exam 2', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'cardio',
        name: 'Cardiology',
        defaultMin: 20,
        stats: { n: 4, mean: 19.0, m2: 9.0 },
        seq: 7,
        counters: [
          { id: 'c11', name: 'Cardio Suite 1 — Dr. Nair', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'ortho',
        name: 'Orthopaedics',
        defaultMin: 15,
        stats: { n: 6, mean: 14.5, m2: 6.8 },
        seq: 11,
        counters: [
          { id: 'c12', name: 'Ortho Consultation Room', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
    ],
  },
  {
    id: 'apollo-demo',
    name: 'Metro Mercy Hospital',
    category: 'hospital',
    demo: true,
    lat: 13.0067,
    lng: 80.2570,
    area: 'Adyar',
    address: '88 Sardar Patel Road, Adyar, Chennai 600020',
    hours: '7:30 AM – 10:00 PM',
    staffPin: '1234',
    rules: {
      priorityCreditMin: { senior: 20, pregnant: 20, disabled: 20, none: 0 },
      arriveByMin: 15,
      graceMin: 5,
      remoteCap: 10,
      remoteEnabled: true,
    },
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        defaultMin: 12,
        stats: { n: 10, mean: 11.8, m2: 4.9 },
        seq: 34,
        counters: [
          { id: 'c13', name: 'Cubicle 1 — Dr. Arvind', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
          { id: 'c14', name: 'Cubicle 2 — Dr. Deepa', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'cardio',
        name: 'Cardiology',
        defaultMin: 18,
        stats: { n: 3, mean: 17.5, m2: 8.0 },
        seq: 8,
        counters: [
          { id: 'c15', name: 'Cardiac OPD Room 3', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'pharm',
        name: 'Pharmacy',
        defaultMin: 4,
        stats: { n: 20, mean: 3.9, m2: 1.5 },
        seq: 52,
        counters: [
          { id: 'c16', name: 'Pharma Counter A', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
      {
        id: 'ortho',
        name: 'Orthopaedics',
        defaultMin: 16,
        stats: { n: 4, mean: 15.0, m2: 7.2 },
        seq: 9,
        counters: [
          { id: 'c17', name: 'Ortho OPD Desk 2', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null },
        ],
      },
    ],
  },
];

// Queues start empty: tickets exist only when a patient joins, staff add a walk-in,
// or the Demo Director simulates patients.
const INITIAL_TICKETS = [];

// ───────────── Event Emitter for Local Realtime ─────────────
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error('Mock event listener error:', err);
      }
    });
  }
}

export const mockEmitter = new EventEmitter();

// ───────────── Stateful Mock Engine Class ─────────────
class MockEngine {
  constructor() {
    this.db = this.loadDatabase();
    this.sweepInterval = null;
    this.startSweep();
  }

  // Load or Initialize DB
  loadDatabase() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load mock DB from localStorage:', e);
    }
    return this.createInitialDb();
  }

  createInitialDb() {
    return {
      orgs: JSON.parse(JSON.stringify(SEED_ORGS)),
      tickets: JSON.parse(JSON.stringify(INITIAL_TICKETS)),
      completedTickets: [],
      settings: {
        clockOffsetMs: 0,
        rushFactor: 1.0,
      },
    };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch (e) {
      console.warn('Could not save mock DB to localStorage:', e);
    }
  }

  // Current time aware of demo clock
  now() {
    return Date.now() + (this.db.settings.clockOffsetMs || 0);
  }

  // ───────────── ETA & Learning Calculations (NeverQ2 §4) ─────────────
  // expected = (K * default + n * mean) / (K + n), with K=3
  calculateExpectedDuration(dept) {
    const K = 3;
    const defaultMin = dept.defaultMin || 15;
    const n = dept.stats?.n || 0;
    const mean = dept.stats?.mean || defaultMin;

    const expected = (K * defaultMin + n * mean) / (K + n);
    // Clamp absurd outliers
    return Math.max(1, Math.min(expected, defaultMin * 4));
  }

  // Calculate spread and confidence label
  getDeptConfidence(dept) {
    const n = dept.stats?.n || 0;
    if (n < 3) return "Low confidence — based on the hospital's default duration";
    if (n < 10) return `Medium — based on ${n} recent consultations`;
    return `Higher — based on ${n} recent consultations`;
  }

  // MOCK: not NeverQ2 §4 (mock ETA maths remains simplified; authoritative ETA is in backend Phase 4)
  // Multi-counter simulation of queue
  simulateQueue(orgId, deptId) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    if (!org) return;
    const dept = org.departments.find((d) => d.id === deptId);
    if (!dept) return;

    const expected = this.calculateExpectedDuration(dept);
    const defaultSpread = expected * 0.35;
    const openCounters = dept.counters.filter((c) => c.state === 'open');

    // Get all waiting tickets for this department, sorted by priority sortKey
    const waitingTickets = this.db.tickets
      .filter((t) => t.orgId === orgId && t.deptId === deptId && t.status === 'waiting')
      .sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return a.sortKey - b.sortKey;
      });

    if (openCounters.length === 0) {
      // Edge case: no open counters
      waitingTickets.forEach((t) => {
        t.lastEta = { low: 0, mid: 0, high: 0, noCounter: true };
      });
      return;
    }

    // Initialize counter availability
    const counterAvailability = openCounters.map((c) => {
      let freeAt = this.now();
      if (c.delayUntil && c.delayUntil > freeAt) {
        freeAt = c.delayUntil;
      }
      if (c.currentTicketId) {
        // Assume consultation running
        freeAt += expected * 60 * 1000 * 0.5;
      }
      return { counter: c, freeAt };
    });

    // Assign each ticket to counter that frees up earliest
    waitingTickets.forEach((ticket, index) => {
      counterAvailability.sort((a, b) => a.freeAt - b.freeAt);
      const earliest = counterAvailability[0];

      const simulatedStartMs = earliest.freeAt;
      const midWaitMin = Math.max(1, Math.round((simulatedStartMs - this.now()) / (60 * 1000)));

      const k = index + 1;
      const combinedSpreadMin = Math.round(defaultSpread * Math.sqrt(k));
      const lowWaitMin = Math.max(1, midWaitMin - combinedSpreadMin);
      const highWaitMin = midWaitMin + combinedSpreadMin;

      const newEta = { low: lowWaitMin, mid: midWaitMin, high: highWaitMin };

      // Check for significant delta (>= 2 min) to append a reason
      if (ticket.lastEta && ticket.lastEta.mid) {
        const delta = newEta.mid - ticket.lastEta.mid;
        if (Math.abs(delta) >= 2) {
          const sign = delta > 0 ? `+${delta}` : `${delta}`;
          ticket.changes = ticket.changes || [];
          ticket.changes.unshift({
            minutes: delta,
            text: `${sign} min wait adjustment`,
            time: this.now(),
          });
          if (ticket.changes.length > 5) ticket.changes.pop();
        }
      }

      ticket.lastEta = newEta;
      if (!ticket.firstEta) ticket.firstEta = newEta;

      // Increment earliest counter availability
      earliest.freeAt += expected * 60 * 1000;
    });

    this.save();
  }

  // Projected wait for a patient who joins right now (0 when a counter is idle and nobody waits)
  estimateNewJoinerEta(dept, waitingCount = 0) {
    const open = dept.counters.filter((c) => c.state === 'open');
    if (open.length === 0) return { low: 0, mid: 0, high: 0, noCounter: true };

    const expected = this.calculateExpectedDuration(dept);
    const spread = expected * 0.35;
    const now = this.now();

    const freeAt = open.map((c) => {
      let t = now;
      if (c.delayUntil && c.delayUntil > t) t = c.delayUntil;
      if (c.currentTicketId) t += expected * 60 * 1000 * 0.5;
      return t;
    });

    for (let i = 0; i < waitingCount; i += 1) {
      freeAt.sort((a, b) => a - b);
      freeAt[0] += expected * 60 * 1000;
    }
    freeAt.sort((a, b) => a - b);

    const waitMin = Math.max(0, Math.round((freeAt[0] - now) / 60000));
    if (waitMin === 0) return { low: 0, mid: 0, high: 0 };
    const sp = Math.round(spread * Math.sqrt(waitingCount + 1));
    return { low: Math.max(1, waitMin - sp), mid: waitMin, high: waitMin + sp };
  }

  // ───────────── Sweep Engine (runs every 10s & on action) ─────────────
  sweep() {
    const now = this.now();
    let changed = false;

    // Check deadlines for not-arrived tickets and grace periods
    this.db.tickets.forEach((ticket) => {
      if (ticket.status === 'waiting' && !ticket.arrived) {
        if (ticket.arriveDeadline && now > ticket.arriveDeadline) {
          if (ticket.lateCount === 0) {
            // Requeue once at the back
            ticket.lateCount = 1;
            ticket.sortKey = now; // moves to back
            ticket.arriveDeadline = now + 15 * 60 * 1000;
            ticket.changes = ticket.changes || [];
            ticket.changes.unshift({
              minutes: 10,
              text: 'Late arrival: ticket re-queued at the back once',
              time: now,
            });
            changed = true;
          } else {
            // Expire ticket
            ticket.status = 'expired';
            changed = true;
          }
        }
      }
    });

    if (changed) {
      this.save();
      mockEmitter.emit('queue:update', { reason: 'sweep' });
    }
  }

  startSweep() {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    this.sweepInterval = setInterval(() => this.sweep(), 10000);
  }

  // ───────────── Public API Methods ─────────────

  // GET /api/orgs?lat&lng&dept
  listOrgs({ lat, lng, dept }) {
    const origin = lat && lng ? { lat: Number(lat), lng: Number(lng) } : { lat: 13.04, lng: 80.24 };

    return this.db.orgs.map((org) => {
      const travel = estimateTravel(origin, { lat: org.lat, lng: org.lng }, 'car');
      // Apply rush factor
      const travelMinutes = Math.round(travel.minutes * (this.db.settings.rushFactor || 1));

      const depts = org.departments.map((d) => {
        this.simulateQueue(org.id, d.id);
        const waitingTickets = this.db.tickets.filter((t) => t.orgId === org.id && t.deptId === d.id && t.status === 'waiting');
        const openCounters = d.counters.filter((c) => c.state === 'open');
        const eta = this.estimateNewJoinerEta(d, waitingTickets.length);

        return {
          id: d.id,
          name: d.name,
          defaultMin: d.defaultMin,
          waitingCount: waitingTickets.length,
          countersOpen: openCounters.length,
          countersTotal: d.counters.length,
          eta,
          confidence: this.getDeptConfidence(d),
        };
      });

      return {
        id: org.id,
        name: org.name,
        category: org.category,
        demo: org.demo,
        lat: org.lat,
        lng: org.lng,
        area: org.area,
        address: org.address,
        hours: org.hours,
        rules: org.rules,
        departments: depts,
        distanceKm: travel.km,
        travelMin: travelMinutes,
      };
    });
  }

  // GET /api/orgs/:id
  getOrg(id) {
    const list = this.listOrgs({});
    const found = list.find((o) => o.id === id);
    if (!found) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };
    return found;
  }

  // POST /api/tickets
  createTicket({ orgId, deptId, name, phone, priority = 'none', deviceId }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };
    if (!org.rules?.remoteEnabled) throw { status: 400, code: 'REMOTE_DISABLED', message: 'Remote queue disabled' };

    const dept = org.departments.find((d) => d.id === deptId);
    if (!dept) throw { status: 404, code: 'NOT_FOUND', message: 'Department not found' };

    // Abuse control 1: One active ticket per phone + device
    const existing = this.db.tickets.find(
      (t) =>
        t.orgId === orgId &&
        (t.phone === phone || (deviceId && t.deviceId === deviceId)) &&
        (t.status === 'waiting' || t.status === 'called' || t.status === 'serving')
    );
    if (existing) {
      throw { status: 409, code: 'DUPLICATE_TICKET', message: 'Active ticket already exists', token: existing.token };
    }

    // Abuse control 2: Cooldown check (2 expired tickets from same phone/device in last 24h)
    const recentExpired = this.db.tickets.filter(
      (t) =>
        (t.phone === phone || (deviceId && t.deviceId === deviceId)) &&
        t.status === 'expired' &&
        this.now() - t.joinedAt < 24 * 60 * 60 * 1000
    );
    if (recentExpired.length >= 2) {
      throw { status: 403, code: 'COOLDOWN', message: 'Remote joining temporarily paused' };
    }

    // Abuse control 3: Remote cap check
    const remoteWaiting = this.db.tickets.filter((t) => t.orgId === orgId && t.deptId === deptId && t.status === 'waiting' && !t.arrived);
    if (remoteWaiting.length >= (org.rules?.remoteCap || 10)) {
      throw { status: 429, code: 'REMOTE_CAP', message: 'Remote capacity reached' };
    }

    // Generate token and label
    dept.seq = (dept.seq || 0) + 1;
    const prefix = dept.name.charAt(0).toUpperCase();
    const label = `${prefix}-${String(dept.seq).padStart(3, '0')}`;
    const token = `${orgId}-${deptId}-${Math.random().toString(36).substring(2, 9)}`;

    // Priority credit
    const creditMin = org.rules?.priorityCreditMin?.[priority] || 0;
    const now = this.now();
    const sortKey = now - creditMin * 60 * 1000;

    const ticket = {
      id: `t-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orgId,
      deptId,
      token,
      label,
      name,
      phone,
      deviceId: deviceId || 'unknown',
      priority,
      urgent: false,
      urgentReason: null,
      status: 'waiting',
      arrived: false,
      lateCount: 0,
      joinedAt: now,
      sortKey,
      calledAt: null,
      startedAt: null,
      doneAt: null,
      arriveDeadline: null,
      firstEta: null,
      lastEta: null,
      changes: [],
      simulated: false,
    };

    this.db.tickets.push(ticket);
    this.simulateQueue(orgId, deptId);
    this.save();

    mockEmitter.emit('queue:update', { orgId, deptId });
    return ticket;
  }

  // GET /api/tickets/:token
  getTicket(token) {
    const ticket = this.db.tickets.find((t) => t.token === token);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };

    const org = this.db.orgs.find((o) => o.id === ticket.orgId);
    const dept = org?.departments.find((d) => d.id === ticket.deptId);

    // Calculate position
    const waitingBefore = this.db.tickets.filter(
      (t) => t.orgId === ticket.orgId && t.deptId === ticket.deptId && t.status === 'waiting' && t.sortKey < ticket.sortKey
    ).length;

    return {
      ...ticket,
      position: ticket.status === 'waiting' ? waitingBefore + 1 : 0,
      org: org ? { id: org.id, name: org.name, lat: org.lat, lng: org.lng, area: org.area } : null,
      dept: dept ? { id: dept.id, name: dept.name, confidence: this.getDeptConfidence(dept) } : null,
    };
  }

  // POST /api/tickets/:token/arrive
  arriveTicket(token, { lat, lng }) {
    const ticket = this.db.tickets.find((t) => t.token === token);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };

    const org = this.db.orgs.find((o) => o.id === ticket.orgId);
    if (org && lat && lng) {
      const dist = haversine({ lat, lng }, { lat: org.lat, lng: org.lng });
      // Within ~300m (0.35 km tolerance)
      if (dist > 0.4) {
        throw { status: 400, code: 'OUT_OF_RANGE', message: 'You are too far from the hospital to check in' };
      }
    }

    ticket.arrived = true;
    ticket.arriveDeadline = null;
    this.save();

    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return ticket;
  }

  // POST /api/tickets/:token/cancel
  cancelTicket(token) {
    const ticket = this.db.tickets.find((t) => t.token === token);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };

    ticket.status = 'cancelled';
    this.simulateQueue(ticket.orgId, ticket.deptId);
    this.save();

    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return { ok: true, status: 'cancelled' };
  }

  // ───────────── Staff API Methods ─────────────

  // POST /api/staff/login
  staffLogin({ orgId, pin }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };
    if (org.staffPin && pin !== org.staffPin) {
      throw { status: 401, code: 'INVALID_PIN', message: 'Invalid staff PIN' };
    }
    const token = `staff-token-${orgId}-${Date.now()}`;
    return { token, orgId, orgName: org.name };
  }

  // GET /api/staff/queue?deptId
  getStaffQueue(orgId, deptId) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };

    const targetDeptId = deptId || org.departments[0]?.id;
    const dept = org.departments.find((d) => d.id === targetDeptId);

    const tickets = this.db.tickets.filter((t) => t.orgId === orgId && t.deptId === targetDeptId);

    return {
      org: { id: org.id, name: org.name },
      department: dept,
      counters: dept?.counters || [],
      tickets,
    };
  }

  // GET /api/orgs/:id/board (Phase 10.1 Public Wait Board)
  getBoard(orgId, deptId = null) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };

    const departments = (deptId 
      ? org.departments.filter((d) => d.id === deptId) 
      : org.departments
    ).map((dept) => {
      // Find counters and any active tokens being served/called
      const counters = (dept.counters || []).map((c) => {
        const activeTicket = c.currentTicketId
          ? this.db.tickets.find((t) => t.id === c.currentTicketId)
          : null;

        return {
          id: c.id,
          name: c.name,
          state: c.state,
          nowServing: activeTicket
            ? {
                id: activeTicket.id,
                label: activeTicket.label,
                status: activeTicket.status, // 'called' | 'serving'
                calledAt: activeTicket.calledAt,
              }
            : null,
        };
      });

      // Find next 5 waiting tickets (strictly privacy safe: NO names or phones)
      const waiting = this.db.tickets
        .filter(
          (t) =>
            t.orgId === orgId &&
            t.deptId === dept.id &&
            (t.status === 'waiting' ||
              (t.status === 'called' && !dept.counters?.some((c) => c.currentTicketId === t.id)))
        )
        .sort((a, b) => {
          if (a.urgent && !b.urgent) return -1;
          if (!a.urgent && b.urgent) return 1;
          if (a.arrived && !b.arrived) return -1;
          if (!a.arrived && b.arrived) return 1;
          return a.sortKey - b.sortKey;
        })
        .slice(0, 5)
        .map((t) => ({
          id: t.id,
          label: t.label,
          arrived: !!t.arrived,
          urgent: !!t.urgent,
          priority: t.priority,
        }));

      // Flatten serving counters into active serving list
      const serving = counters
        .filter((c) => c.nowServing)
        .map((c) => ({
          counterId: c.id,
          counterName: c.name,
          label: c.nowServing.label,
          status: c.nowServing.status,
          calledAt: c.nowServing.calledAt,
        }));

      return {
        id: dept.id,
        name: dept.name,
        counters,
        serving,
        waiting,
      };
    });

    return {
      org: {
        id: org.id,
        name: org.name,
        area: org.area,
        address: org.address,
        departments: (org.departments || []).map((d) => ({ id: d.id, name: d.name })),
      },
      departments,
      updatedAt: this.now(),
    };
  }

  // POST /api/staff/counters/:id/call-next (Atomic)
  callNext(orgId, counterId) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    let targetCounter, targetDept;

    for (const d of org.departments) {
      const c = d.counters.find((item) => item.id === counterId);
      if (c) {
        targetCounter = c;
        targetDept = d;
        break;
      }
    }

    if (!targetCounter) throw { status: 404, code: 'NOT_FOUND', message: 'Counter not found' };
    if (targetCounter.state !== 'open') throw { status: 400, code: 'COUNTER_NOT_OPEN', message: 'Counter is not open' };

    // Find the first arrived waiting ticket
    const arrivedTicket = this.db.tickets
      .filter((t) => t.orgId === orgId && t.deptId === targetDept.id && t.status === 'waiting' && t.arrived)
      .sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return a.sortKey - b.sortKey;
      })[0];

    if (!arrivedTicket) {
      throw { status: 404, code: 'NO_ARRIVED_TICKETS', message: 'No arrived patients in queue' };
    }

    // Atomic update
    arrivedTicket.status = 'called';
    arrivedTicket.calledAt = this.now();
    targetCounter.currentTicketId = arrivedTicket.id;

    this.simulateQueue(orgId, targetDept.id);
    this.save();

    mockEmitter.emit('ticket:called', { ticket: arrivedTicket, counter: targetCounter });
    mockEmitter.emit('ticket:update', arrivedTicket);
    mockEmitter.emit('queue:update', { orgId, deptId: targetDept.id });

    return { ticket: arrivedTicket, counter: targetCounter };
  }

  // POST /api/staff/tickets/:id/start
  startTicket(ticketId) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };

    ticket.status = 'serving';
    ticket.startedAt = this.now();
    this.save();

    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return ticket;
  }

  // POST /api/staff/tickets/:id/done
  doneTicket(ticketId) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };

    const now = this.now();
    ticket.status = 'done';
    ticket.doneAt = now;

    // Record duration for learning
    if (ticket.startedAt) {
      const durationMin = (now - ticket.startedAt) / (60 * 1000);
      const org = this.db.orgs.find((o) => o.id === ticket.orgId);
      const dept = org?.departments.find((d) => d.id === ticket.deptId);
      if (dept && durationMin >= 1 && durationMin <= (dept.defaultMin || 15) * 4) {
        // Welford's algorithm online update for variance
        dept.stats = dept.stats || { n: 0, mean: dept.defaultMin || 15, m2: 0 };
        dept.stats.n += 1;
        const delta = durationMin - dept.stats.mean;
        dept.stats.mean += delta / dept.stats.n;
        const delta2 = durationMin - dept.stats.mean;
        dept.stats.m2 += delta * delta2;
      }
    }

    // Free counter
    const org = this.db.orgs.find((o) => o.id === ticket.orgId);
    org?.departments.forEach((d) => {
      d.counters.forEach((c) => {
        if (c.currentTicketId === ticket.id) c.currentTicketId = null;
      });
    });

    this.simulateQueue(ticket.orgId, ticket.deptId);
    this.save();

    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return ticket;
  }

  // POST /api/staff/tickets/:id/arrive
  confirmArrival(ticketId) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };
    ticket.arrived = true;
    ticket.arriveDeadline = null;
    this.save();
    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return ticket;
  }

  // POST /api/staff/tickets/:id/remove-claim
  removeClaim(ticketId) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };
    ticket.priority = 'none';
    this.simulateQueue(ticket.orgId, ticket.deptId);
    this.save();
    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return ticket;
  }

  // POST /api/staff/tickets/:id/remove
  removeTicket(ticketId, { blockPhone = false } = {}) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };
    ticket.status = 'removed';
    this.simulateQueue(ticket.orgId, ticket.deptId);
    this.save();
    mockEmitter.emit('ticket:update', ticket);
    mockEmitter.emit('queue:update', { orgId: ticket.orgId, deptId: ticket.deptId });
    return { ok: true, status: 'removed' };
  }

  // POST /api/staff/walkin
  addWalkin({ orgId, deptId, name, priority = 'none' }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    const dept = org?.departments.find((d) => d.id === deptId);
    if (!dept) throw { status: 404, code: 'NOT_FOUND', message: 'Department not found' };

    dept.seq = (dept.seq || 0) + 1;
    const prefix = dept.name.charAt(0).toUpperCase();
    const label = `${prefix}-${String(dept.seq).padStart(3, '0')}`;
    const token = `walkin-${Date.now()}`;
    const now = this.now();

    const ticket = {
      id: `t-walkin-${Date.now()}`,
      orgId,
      deptId,
      token,
      label,
      name: name || 'Walk-in Patient',
      phone: '',
      deviceId: 'walkin',
      priority,
      urgent: false,
      urgentReason: null,
      status: 'waiting',
      arrived: true, // Walk-in is arrived immediately
      lateCount: 0,
      joinedAt: now,
      sortKey: now,
      calledAt: null,
      startedAt: null,
      doneAt: null,
      arriveDeadline: null,
      firstEta: null,
      lastEta: null,
      changes: [],
      simulated: false,
    };

    this.db.tickets.push(ticket);
    this.simulateQueue(orgId, deptId);
    this.save();

    mockEmitter.emit('queue:update', { orgId, deptId });
    return ticket;
  }

  // POST /api/staff/urgent
  insertUrgent({ orgId, deptId, name, reason }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    const dept = org?.departments.find((d) => d.id === deptId);
    if (!dept) throw { status: 404, code: 'NOT_FOUND', message: 'Department not found' };

    dept.seq = (dept.seq || 0) + 1;
    const prefix = dept.name.charAt(0).toUpperCase();
    const label = `URG-${String(dept.seq).padStart(3, '0')}`;
    const token = `urg-${Date.now()}`;
    const now = this.now();

    const ticket = {
      id: `t-urg-${Date.now()}`,
      orgId,
      deptId,
      token,
      label,
      name,
      phone: '',
      deviceId: 'staff',
      priority: 'none',
      urgent: true,
      urgentReason: reason,
      status: 'waiting',
      arrived: true,
      lateCount: 0,
      joinedAt: now,
      sortKey: Number.MIN_SAFE_INTEGER, // F-18: -Infinity becomes null in JSON, use MIN_SAFE_INTEGER instead
      calledAt: null,
      startedAt: null,
      doneAt: null,
      arriveDeadline: null,
      firstEta: null,
      lastEta: null,
      changes: [{ minutes: 0, text: `Urgent case inserted: ${reason}`, time: now }],
      simulated: false,
    };

    this.db.tickets.push(ticket);
    this.simulateQueue(orgId, deptId);
    this.save();

    mockEmitter.emit('queue:update', { orgId, deptId });
    return ticket;
  }

  // POST /api/staff/counters/:id/delay
  setCounterDelay(orgId, counterId, { minutes, reason }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    let targetCounter, targetDept;

    for (const d of org.departments) {
      const c = d.counters.find((item) => item.id === counterId);
      if (c) {
        targetCounter = c;
        targetDept = d;
        break;
      }
    }

    if (!targetCounter) throw { status: 404, code: 'NOT_FOUND', message: 'Counter not found' };

    targetCounter.delayUntil = this.now() + minutes * 60 * 1000;
    targetCounter.delayReason = reason;

    this.simulateQueue(orgId, targetDept.id);
    this.save();

    mockEmitter.emit('queue:update', { orgId, deptId: targetDept.id });
    return targetCounter;
  }

  // POST /api/staff/counters/:id/state
  setCounterState(orgId, counterId, { state }) {
    const org = this.db.orgs.find((o) => o.id === orgId);
    let targetCounter, targetDept;

    for (const d of org.departments) {
      const c = d.counters.find((item) => item.id === counterId);
      if (c) {
        targetCounter = c;
        targetDept = d;
        break;
      }
    }

    if (!targetCounter) throw { status: 404, code: 'NOT_FOUND', message: 'Counter not found' };

    targetCounter.state = state;
    this.simulateQueue(orgId, targetDept.id);
    this.save();

    mockEmitter.emit('queue:update', { orgId, deptId: targetDept.id });
    return targetCounter;
  }

  // ───────────── Admin & Demo API Methods ─────────────

  // POST /api/admin/login
  adminLogin({ password }) {
    if (password !== 'admin123' && password !== 'admin') {
      throw { status: 401, code: 'INVALID_PASSWORD', message: 'Invalid admin password' };
    }
    return { token: `admin-token-${Date.now()}` };
  }

  // GET /api/admin/summary
  getAdminSummary() {
    const totalHospitals = this.db.orgs.length;
    let totalCounters = 0;
    let activeTickets = 0;

    this.db.orgs.forEach((o) => {
      o.departments.forEach((d) => {
        totalCounters += d.counters.length;
      });
    });

    activeTickets = this.db.tickets.filter((t) => t.status === 'waiting' || t.status === 'called' || t.status === 'serving').length;

    return {
      totalHospitals,
      totalCounters,
      activeTickets,
      demoClockOffsetMinutes: Math.round((this.db.settings.clockOffsetMs || 0) / (60 * 1000)),
      rushFactor: this.db.settings.rushFactor || 1,
    };
  }

  // POST /api/admin/demo/reset
  demoReset() {
    this.db = this.createInitialDb();
    this.save();
    mockEmitter.emit('queue:update', { reason: 'reset' });
    return { ok: true, message: 'Reset complete' };
  }

  // POST /api/admin/demo/fast-forward
  demoFastForward({ minutes }) {
    this.db.settings.clockOffsetMs = (this.db.settings.clockOffsetMs || 0) + minutes * 60 * 1000;
    this.sweep();
    this.save();
    mockEmitter.emit('queue:update', { reason: 'fast-forward' });
    return {
      clockOffsetMs: this.db.settings.clockOffsetMs,
      offsetMinutes: Math.round(this.db.settings.clockOffsetMs / (60 * 1000)),
    };
  }

  // POST /api/admin/demo/rush-hour
  demoRushHour({ factor }) {
    this.db.settings.rushFactor = factor;
    this.save();
    mockEmitter.emit('queue:update', { reason: 'rush-hour' });
    return { rushFactor: factor };
  }

  // POST /api/admin/demo/simulate
  simulatePatients({ orgId = 'harbour', deptId = 'gen', count = 5 }) {
    const org = this.db.orgs.find((o) => o.id === orgId) || this.db.orgs[0];
    const dept = org.departments.find((d) => d.id === deptId) || org.departments[0];
    const priorities = ['none', 'none', 'senior', 'pregnant', 'none', 'disabled'];
    const names = ['Aakash R.', 'Sunita P.', 'Karthik V.', 'Meera S.', 'Daniel K.', 'Fatima Z.', 'Murugan T.', 'Deepa N.'];

    const created = [];
    const now = this.now();

    for (let i = 0; i < count; i++) {
      dept.seq = (dept.seq || 0) + 1;
      const prefix = dept.name.charAt(0).toUpperCase();
      const label = `${prefix}-${String(dept.seq).padStart(3, '0')}`;
      const token = `sim-${Date.now()}-${i}`;
      const priority = priorities[i % priorities.length];
      const isArrived = i % 2 === 0;

      const ticket = {
        id: `t-sim-${Date.now()}-${i}`,
        orgId: org.id,
        deptId: dept.id,
        token,
        label,
        name: names[i % names.length],
        phone: '',
        deviceId: 'sim',
        priority,
        urgent: false,
        urgentReason: null,
        status: 'waiting',
        arrived: isArrived,
        lateCount: 0,
        joinedAt: now - (count - i) * 2 * 60 * 1000,
        sortKey: now - (count - i) * 2 * 60 * 1000,
        calledAt: null,
        startedAt: null,
        doneAt: null,
        arriveDeadline: isArrived ? null : now + 15 * 60 * 1000,
        firstEta: { low: 10, mid: 15, high: 20 },
        lastEta: { low: 10, mid: 15, high: 20 },
        changes: [],
        simulated: true,
      };

      this.db.tickets.push(ticket);
      created.push(ticket);
    }

    this.simulateQueue(org.id, dept.id);
    this.save();
    mockEmitter.emit('queue:update', { reason: 'simulate' });
    return created;
  }

  // POST /api/admin/orgs
  createOrg(payload) {
    const id = payload.id || `org-${Date.now().toString(36)}`;
    const newOrg = {
      id,
      name: payload.name || 'New Community Medical Centre',
      category: 'hospital',
      demo: true,
      lat: Number(payload.lat) || 13.0450,
      lng: Number(payload.lng) || 80.2450,
      area: payload.area || 'Central',
      address: payload.address || 'Chennai, India',
      hours: payload.hours || '8:00 AM – 8:00 PM',
      staffPin: payload.staffPin || '1234',
      open: payload.open !== false,
      rules: {
        priorityCreditMin: payload.rules?.priorityCreditMin || { senior: 20, pregnant: 20, disabled: 20, none: 0 },
        arriveByMin: Number(payload.rules?.arriveByMin) || 15,
        graceMin: Number(payload.rules?.graceMin) || 5,
        remoteCap: Number(payload.rules?.remoteCap) || 10,
        remoteEnabled: payload.rules?.remoteEnabled !== false,
      },
      departments: payload.departments || [
        {
          id: 'gen',
          name: 'General OPD',
          defaultMin: 12,
          stats: { n: 5, mean: 12.0, m2: 5.0 },
          seq: 10,
          counters: [{ id: 'c1', name: 'Room 1 — Consulting', state: 'open', currentTicketId: null, delayUntil: null, delayReason: null }],
        },
      ],
    };

    this.db.orgs.push(newOrg);
    this.save();
    mockEmitter.emit('queue:update', { reason: 'create-org' });
    return newOrg;
  }

  // PUT /api/admin/orgs/:id
  updateOrg(id, payload) {
    const org = this.db.orgs.find((o) => o.id === id);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };

    if (payload.name) org.name = payload.name;
    if (payload.lat !== undefined) org.lat = Number(payload.lat);
    if (payload.lng !== undefined) org.lng = Number(payload.lng);
    if (payload.area) org.area = payload.area;
    if (payload.address) org.address = payload.address;
    if (payload.staffPin) org.staffPin = payload.staffPin;
    if (payload.open !== undefined) org.open = payload.open;
    if (payload.rules) org.rules = { ...org.rules, ...payload.rules };
    if (payload.departments) org.departments = payload.departments;

    this.save();
    mockEmitter.emit('queue:update', { reason: 'update-org' });
    return org;
  }

  // POST /api/admin/orgs/:id/toggle-open
  toggleOrgStatus(id) {
    const org = this.db.orgs.find((o) => o.id === id);
    if (!org) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };
    const currentlyOpen = org.open !== false;
    org.open = !currentlyOpen;
    this.save();
    mockEmitter.emit('queue:update', { reason: 'toggle-status', orgId: id, open: org.open });
    return org;
  }

  // DELETE /api/admin/orgs/:id
  deleteOrg(id) {
    const idx = this.db.orgs.findIndex((o) => o.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: 'Hospital not found' };
    const org = this.db.orgs[idx];
    if (org.seeded && org.demo) {
      throw { status: 400, code: 'CANNOT_DELETE_SEEDED', message: 'Seeded demo hospitals cannot be deleted. You can close the facility instead.' };
    }
    this.db.orgs.splice(idx, 1);
    this.db.tickets = (this.db.tickets || []).filter((t) => t.orgId !== id);
    this.save();
    mockEmitter.emit('queue:update', { reason: 'delete-org', orgId: id });
    return { success: true, id };
  }

  // ───────────── Phase 0.11 Contracts ─────────────

  // GET /api/staff/insights?deptId=
  getStaffInsights(deptId) {
    let targetDept;
    for (const org of this.db.orgs) {
      const d = org.departments?.find((item) => item.id === deptId);
      if (d) { targetDept = d; break; }
    }
    const defaultMin = targetDept?.defaultMin || 12;
    const stats = targetDept?.stats || { n: 0, mean: defaultMin, m2: 0 };
    const variance = stats.n > 1 ? stats.m2 / (stats.n - 1) : Math.pow(defaultMin * 0.35, 2);
    const sd = Number(Math.sqrt(Math.max(0, variance)).toFixed(1));
    const expectedMin = this.calculateExpectedDuration(targetDept || { defaultMin, stats });
    const confidenceLevel = stats.n >= 10 ? 'high' : stats.n >= 3 ? 'medium' : 'low';
    const confidence = this.getDeptConfidence(targetDept || { stats });

    const completed = this.db.tickets.filter((t) => (t.deptId === deptId || !deptId) && t.status === 'done');
    const rows = completed.slice(-10).map((t) => ({
      label: t.label,
      predictedMin: t.firstEta?.mid || defaultMin,
      actualMin: t.doneAt && t.startedAt ? Math.round((t.doneAt - t.startedAt) / 60000) : defaultMin,
      simulated: !!t.simulated,
    }));

    return {
      deptId,
      deptName: targetDept?.name || 'General OPD',
      defaultMin,
      stats: { n: stats.n || 0, mean: Number((stats.mean || defaultMin).toFixed(1)), sd },
      expectedMin: Number(expectedMin.toFixed(1)),
      confidenceLevel,
      confidence,
      history: [12.0, 12.5, 12.8, 13.0, Number((stats.mean || defaultMin).toFixed(1))],
      rows: rows.length ? rows : [
        { label: 'G-008', predictedMin: 12, actualMin: 11, simulated: true },
        { label: 'G-009', predictedMin: 14, actualMin: 15, simulated: true },
        { label: 'G-010', predictedMin: 10, actualMin: 10, simulated: false },
      ],
      coverage: 80.0,
    };
  }

  // GET /api/staff/tickets/:id/phone
  revealPhone(ticketId) {
    const ticket = this.db.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw { status: 404, code: 'NOT_FOUND', message: 'Ticket not found' };
    return { phone: ticket.phone || '+91 98765 43210' };
  }

  // POST /api/admin/demo/scenario
  demoScenario({ type, orgId, deptId }) {
    const org = this.db.orgs.find((o) => o.id === orgId) || this.db.orgs[0];
    const dept = org.departments?.find((d) => d.id === deptId) || org.departments?.[0];
    const counters = dept?.counters || [];

    if (type === 'delay') {
      const c = counters[0];
      if (c) {
        c.delayUntil = this.now() + 15 * 60 * 1000;
        c.delayReason = 'Emergency phone consult';
      }
    } else if (type === 'open-counter' || type === 'open-c2') {
      const c = counters[1] || counters[0];
      if (c) c.state = 'open';
    } else if (type === 'urgent') {
      this.insertUrgent(org.id, dept.id, { name: 'Triage Patient', reason: 'Critical breathlessness' });
    } else if (type === 'no-show') {
      const t = this.createTicket({
        orgId: org.id,
        deptId: dept.id,
        name: 'Remote Patient (No-show demo)',
        phone: '+919888800000',
        priority: 'none',
      });
      t.arriveDeadline = this.now() - 1000;
      this.sweep();
    } else if (type === 'story-setup') {
      const harbour = this.db.orgs.find((o) => o.id === 'harbour');
      if (harbour) {
        const eye = harbour.departments.find((d) => d.id === 'eye');
        if (eye) eye.stats = { n: 2, mean: 24, m2: 12 };
      }
    }

    if (dept) this.simulateQueue(org.id, dept.id);
    this.save();
    mockEmitter.emit('queue:update', { orgId: org.id, deptId: dept?.id, reason: type });
    return { success: true, scenario: type };
  }

  // POST /api/admin/demo/clock
  demoSetClock({ offsetMinutes }) {
    this.db.settings.clockOffsetMs = (Number(offsetMinutes) || 0) * 60 * 1000;
    this.sweep();
    this.save();
    mockEmitter.emit('queue:update', { reason: 'clock-set' });
    return {
      clockOffsetMs: this.db.settings.clockOffsetMs,
      offsetMinutes: Math.round(this.db.settings.clockOffsetMs / (60 * 1000)),
    };
  }

  // GET /api/meta
  getMeta() {
    return {
      serverNow: this.now(),
      clockOffsetMs: this.db.settings.clockOffsetMs || 0,
      rushFactor: this.db.settings.rushFactor || 1,
      demo: true,
      version: '0.1.0',
    };
  }
}

export const mockEngine = new MockEngine();
