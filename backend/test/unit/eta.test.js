// backend/test/unit/eta.test.js
// Authoritative Phase 4 ETA Engine unit tests
// Covers: Test Vectors V1–V10, Edge Cases E1–E20, Property Tests (1,000 queues), Welford equivalence, and Drift Invariance

import { describe, it, expect } from 'vitest';
import { RULES } from '../../src/config/rules.js';
import {
  calculateExpected,
  calculateSpread,
  updateStats,
  getConfidence,
} from '../../src/services/eta/stats.js';
import { computeSnapshot, compareWaitingTickets } from '../../src/services/eta/engine.js';
import { formatReason } from '../../src/services/eta/reasons.js';

describe('Phase 4: Authoritative ETA Engine', () => {
  const BASE_NOW = 1700000000000; // Fixed demo-clock epoch ms

  describe('4.1 Test Vectors V1–V10 (§4.11)', () => {
    it('V1: Harbour Eye stats baseline', () => {
      // Setup: D=22, n=2, mean=24, m2=12
      const expected = calculateExpected(22, 2, 24);
      expect(Number(expected.toFixed(2))).toBe(22.8);

      const sdPP = calculateSpread(22, expected, 2, 12);
      expect(Number(sdPP.toFixed(2))).toBe(6.35);
    });

    it('V2: D=22, n=0 prior baseline', () => {
      const expected = calculateExpected(22, 0, 0);
      expect(expected).toBe(22);

      const sdPP = calculateSpread(22, expected, 0, 0);
      expect(Number(sdPP.toFixed(2))).toBe(7.7);
    });

    it('V3: D=22, n=0, 1 idle counter, 3 waiting tickets', () => {
      const dept = { defaultMin: 22, stats: { n: 0, mean: 0, m2: 0 } };
      const counters = [{ _id: 'c1', state: 'open' }];
      const tickets = [
        { _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', token: 'T2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
        { _id: 't3', token: 'T3', status: 'waiting', joinedAt: BASE_NOW + 2000 },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets[0]).toMatchObject({ low: 0, mid: 0, high: 0 });
      expect(res.tickets[1]).toMatchObject({ low: 12, mid: 22, high: 32 });
      expect(res.tickets[2]).toMatchObject({ low: 30, mid: 44, high: 58 });
    });

    it('V4: D=22, n=0, counter serving since 10 min ago, 2 waiting', () => {
      const dept = { defaultMin: 22, stats: { n: 0, mean: 0, m2: 0 } };
      const counters = [
        {
          _id: 'c1',
          state: 'open',
          status: 'serving',
          startedAt: BASE_NOW - 10 * 60000,
        },
      ];
      const tickets = [
        { _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', token: 'T2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets[0]).toMatchObject({ low: 5, mid: 12, high: 19 });
      expect(res.tickets[1]).toMatchObject({ low: 22, mid: 34, high: 46 });
    });

    it('V5: Counter serving since 40 min ago (overrun), 1 waiting', () => {
      const dept = { defaultMin: 22, stats: { n: 0, mean: 0, m2: 0 } };
      const counters = [
        {
          _id: 'c1',
          state: 'open',
          status: 'serving',
          startedAt: BASE_NOW - 40 * 60000,
        },
      ];
      const tickets = [{ _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW }];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets[0]).toMatchObject({ low: 0, mid: 6, high: 20 });
      expect(res.caveats).toContain('counter_overrun');
    });

    it('V6: Harbour General with delayed counter c1 and idle c2', () => {
      // D=12, n=5, mean=13.5, m2=8.2 -> expected 12.94, sdPP 2.81
      const dept = { defaultMin: 12, stats: { n: 5, mean: 13.5, m2: 8.2 } };
      const counters = [
        { _id: 'c1', state: 'open', delayUntil: BASE_NOW + 15 * 60000 },
        { _id: 'c2', state: 'open' },
      ];
      const tickets = [
        { _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', token: 'T2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
        { _id: 't3', token: 'T3', status: 'waiting', joinedAt: BASE_NOW + 2000 },
        { _id: 't4', token: 'T4', status: 'waiting', joinedAt: BASE_NOW + 3000 },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets[0]).toMatchObject({ low: 0, mid: 0, high: 0 });
      expect(res.tickets[1]).toMatchObject({ low: 9, mid: 13, high: 17 });
      expect(res.tickets[2]).toMatchObject({ low: 10, mid: 15, high: 20 });
      expect(res.tickets[3]).toMatchObject({ low: 21, mid: 26, high: 31 });
      expect(res.caveats).toContain('delay_active');
    });

    it('V7: V6 without the delay', () => {
      const dept = { defaultMin: 12, stats: { n: 5, mean: 13.5, m2: 8.2 } };
      const counters = [
        { _id: 'c1', state: 'open' },
        { _id: 'c2', state: 'open' },
      ];
      const tickets = [
        { _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', token: 'T2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
        { _id: 't3', token: 'T3', status: 'waiting', joinedAt: BASE_NOW + 2000 },
        { _id: 't4', token: 'T4', status: 'waiting', joinedAt: BASE_NOW + 3000 },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets[0]).toMatchObject({ low: 0, mid: 0, high: 0 });
      expect(res.tickets[1]).toMatchObject({ low: 0, mid: 0, high: 0 });
      expect(res.tickets[2]).toMatchObject({ low: 9, mid: 13, high: 17 });
      expect(res.tickets[3]).toMatchObject({ low: 9, mid: 13, high: 17 });
    });

    it('V8: Urgent ticket insertion prioritised over earlier waiting tickets', () => {
      const dept = { defaultMin: 22, stats: { n: 0, mean: 0, m2: 0 } };
      const counters = [{ _id: 'c1', state: 'open' }];
      const tickets = [
        { _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', token: 'T2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
        { _id: 'u1', token: 'U1', status: 'waiting', urgent: true, urgentAt: BASE_NOW + 2000 },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      // U1 jumps to position 1
      expect(res.tickets[0].token).toBe('U1');
      expect(res.tickets[0]).toMatchObject({ low: 0, mid: 0, high: 0 });

      expect(res.tickets[1].token).toBe('T1');
      expect(res.tickets[1]).toMatchObject({ low: 12, mid: 22, high: 32 });

      expect(res.tickets[2].token).toBe('T2');
      expect(res.tickets[2]).toMatchObject({ low: 30, mid: 44, high: 58 });
    });

    it('V9: Learning from n=0 with a 17-min sample (D=22)', () => {
      const updated = updateStats({ n: 0, mean: 0, m2: 0 }, 17, 22);
      expect(updated.n).toBe(1);
      expect(updated.mean).toBe(17);
      expect(updated.m2).toBe(0);

      const expected = calculateExpected(22, updated.n, updated.mean);
      expect(expected).toBe(20.75);
    });

    it('V9b: n=2, mean=24, m2=12 + 17-min sample flips label Low -> Medium', () => {
      const updated = updateStats({ n: 2, mean: 24, m2: 12 }, 17, 22);
      expect(updated.n).toBe(3);
      expect(Number(updated.mean.toFixed(2))).toBe(21.67);
      expect(Number(updated.m2.toFixed(2))).toBe(44.67);

      const expected = calculateExpected(22, updated.n, updated.mean);
      expect(Number(expected.toFixed(2))).toBe(21.83);

      const sdPP = calculateSpread(22, expected, updated.n, updated.m2);
      expect(Number(sdPP.toFixed(2))).toBe(6.39);

      const conf = getConfidence(updated.n);
      expect(conf.confidenceLevel).toBe('medium');
    });

    it('V9c: A 0.5-min sample (< 1 min) is ignored', () => {
      const stats = { n: 2, mean: 24, m2: 12 };
      const updated = updateStats(stats, 0.5, 22);
      expect(updated.updated).toBe(false);
      expect(updated.n).toBe(2);
      expect(updated.mean).toBe(24);
      expect(updated.m2).toBe(12);
    });

    it('V9d: A 200-min sample at D=22, n=0 is clamped to 4*D = 88', () => {
      const updated = updateStats({ n: 0, mean: 0, m2: 0 }, 200, 22);
      expect(updated.n).toBe(1);
      expect(updated.mean).toBe(88);
    });

    it('V10: Only a paused counter returns noCounter: true and null ranges', () => {
      const dept = { defaultMin: 12, stats: { n: 5, mean: 12, m2: 5 } };
      const counters = [{ _id: 'c1', state: 'paused' }];
      const tickets = [{ _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW }];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.noCounter).toBe(true);
      expect(res.newJoiner.low).toBeNull();
      expect(res.newJoiner.mid).toBeNull();
      expect(res.newJoiner.high).toBeNull();
      expect(res.caveats).toContain('no_counter');
      expect(res.caveats).toContain('paused_counter');
    });
  });

  describe('4.2 Edge Cases E1–E20 (§4.10)', () => {
    it('E1: Empty queue, idle counter -> mid=0, No wait', () => {
      const res = computeSnapshot({
        department: { defaultMin: 15 },
        counters: [{ _id: 'c1', state: 'open' }],
        tickets: [],
        now: BASE_NOW,
      });

      expect(res.newJoiner.mid).toBe(0);
      expect(res.newJoiner.low).toBe(0);
      expect(res.newJoiner.high).toBe(0);
    });

    it('E2: n=0, m2=0 -> expected = D, sdPP = 0.35 * D', () => {
      const exp = calculateExpected(20, 0, 0);
      expect(exp).toBe(20);
      const sd = calculateSpread(20, exp, 0, 0);
      expect(sd).toBeCloseTo(7.0);
    });

    it('E3: Tiny m2 bounded by floor 0.20 * expected', () => {
      // Seed Harbour pharmacy: D=5, n=12, mean=4.8, m2=0.01
      const exp = calculateExpected(5, 12, 4.8);
      const sd = calculateSpread(5, exp, 12, 0.01);
      expect(sd).toBeGreaterThanOrEqual(0.20 * exp);
    });

    it('E4: No open counter -> null range and noCounter flag', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'closed' }],
        tickets: [{ _id: 't1', status: 'waiting' }],
        now: BASE_NOW,
      });
      expect(res.noCounter).toBe(true);
      expect(res.newJoiner.mid).toBeNull();
    });

    it('E5: All counters delayed -> start = delayUntil and caveat delay_active', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open', delayUntil: BASE_NOW + 10 * 60000 }],
        tickets: [{ _id: 't1', status: 'waiting', joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      expect(res.tickets[0].startMs).toBe(BASE_NOW + 10 * 60000);
      expect(res.caveats).toContain('delay_active');
    });

    it('E6: Delay in the past (delayUntil <= now) is ignored', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open', delayUntil: BASE_NOW - 5000 }],
        tickets: [{ _id: 't1', status: 'waiting', joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      expect(res.tickets[0].startMs).toBe(BASE_NOW);
      expect(res.caveats).not.toContain('delay_active');
    });

    it('E7: Overrun consultation uses remainder rule and adds counter_overrun', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open', status: 'serving', startedAt: BASE_NOW - 25 * 60000 }],
        tickets: [{ _id: 't1', status: 'waiting', joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      expect(res.caveats).toContain('counter_overrun');
      expect(res.tickets[0].mid).toBeGreaterThan(0);
    });

    it('E8: startedAt in the future clamps elapsed to 0', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open', status: 'serving', startedAt: BASE_NOW + 60000 }],
        tickets: [{ _id: 't1', status: 'waiting', joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      // Should not throw and remaining consultation is at least expected
      expect(res.tickets[0].mid).toBe(10);
    });

    it('E9: Urgent ticket inserted shifts others by one service period', () => {
      const dept = { defaultMin: 10 };
      const counters = [{ _id: 'c1', state: 'open' }];

      const before = computeSnapshot({
        department: dept,
        counters,
        tickets: [{ _id: 't1', status: 'waiting', joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      expect(before.tickets[0].mid).toBe(0);

      const after = computeSnapshot({
        department: dept,
        counters,
        tickets: [
          { _id: 't1', status: 'waiting', joinedAt: BASE_NOW },
          { _id: 'u1', status: 'waiting', urgent: true, urgentAt: BASE_NOW + 5000 },
        ],
        now: BASE_NOW,
      });

      expect(after.tickets[0].ticketId).toBe('u1');
      expect(after.tickets[0].mid).toBe(0);
      expect(after.tickets[1].ticketId).toBe('t1');
      expect(after.tickets[1].mid).toBe(10);
    });

    it('E10: Two urgents sorted FIFO by urgentAt', () => {
      const tickets = [
        { _id: 'u2', status: 'waiting', urgent: true, urgentAt: BASE_NOW + 2000 },
        { _id: 'u1', status: 'waiting', urgent: true, urgentAt: BASE_NOW + 1000 },
      ];
      tickets.sort(compareWaitingTickets);
      expect(tickets[0]._id).toBe('u1');
      expect(tickets[1]._id).toBe('u2');
    });

    it('E11: Not-arrived tickets simulated with assumes_arrival caveat', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open' }],
        tickets: [{ _id: 't1', status: 'waiting', arrived: false, joinedAt: BASE_NOW }],
        now: BASE_NOW,
      });
      expect(res.caveats).toContain('assumes_arrival');
    });

    it('E12: Counter states correctly reflected in capacity', () => {
      const openRes = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open' }, { _id: 'c2', state: 'open' }],
        tickets: [{ _id: 't1', status: 'waiting' }, { _id: 't2', status: 'waiting' }],
        now: BASE_NOW,
      });
      // Both served immediately at time 0
      expect(openRes.tickets[0].mid).toBe(0);
      expect(openRes.tickets[1].mid).toBe(0);

      const oneClosedRes = computeSnapshot({
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open' }, { _id: 'c2', state: 'closed' }],
        tickets: [{ _id: 't1', status: 'waiting' }, { _id: 't2', status: 'waiting' }],
        now: BASE_NOW,
      });
      expect(oneClosedRes.tickets[0].mid).toBe(0);
      expect(oneClosedRes.tickets[1].mid).toBe(10);
    });

    it('E13 & E14: Sample bounding rules (< 1 min ignored, > 4*D clamped)', () => {
      const stats = { n: 1, mean: 10, m2: 0 };
      expect(updateStats(stats, 0.8, 10).updated).toBe(false);

      const clamped = updateStats(stats, 50, 10);
      expect(clamped.updated).toBe(true);
      expect(clamped.mean).toBeLessThanOrEqual(40);
    });

    it('E15: defaultMin <= 0 or NaN throws an error', () => {
      expect(() => calculateExpected(0, 0, 0)).toThrow();
      expect(() => calculateExpected(-5, 0, 0)).toThrow();
      expect(() => calculateExpected(NaN, 0, 0)).toThrow();
      expect(() => computeSnapshot({ department: { defaultMin: 0 }, now: BASE_NOW })).toThrow();
    });

    it('E16: Non-finite inputs handled safely', () => {
      const res = computeSnapshot({
        department: { defaultMin: 10, stats: { n: 5, mean: Infinity, m2: 0 } },
        counters: [{ _id: 'c1', state: 'open' }],
        tickets: [],
        now: BASE_NOW,
      });
      expect(res.noCounter).toBe(true);
      expect(res.caveats).toContain('calculation_unavailable');
    });

    it('E17: Closed hospital returns orgClosed: true and null ranges', () => {
      const res = computeSnapshot({
        org: { open: false },
        department: { defaultMin: 10 },
        counters: [{ _id: 'c1', state: 'open' }],
        tickets: [{ _id: 't1', status: 'waiting' }],
        now: BASE_NOW,
      });
      expect(res.orgClosed).toBe(true);
      expect(res.newJoiner.low).toBeNull();
      expect(res.newJoiner.mid).toBeNull();
    });

    it('E18: Ordering ties broken deterministically by joinedAt then ID', () => {
      const tickets = [
        { _id: 'tB', sortKey: 100, joinedAt: 50, status: 'waiting' },
        { _id: 'tA', sortKey: 100, joinedAt: 50, status: 'waiting' },
      ];
      tickets.sort(compareWaitingTickets);
      expect(tickets[0]._id).toBe('tA');
      expect(tickets[1]._id).toBe('tB');
    });

    it('E19: Wait exceeding 8 hours adds very_long caveat', () => {
      const dept = { defaultMin: 60 }; // 1 hour per patient
      const counters = [{ _id: 'c1', state: 'open' }];
      const tickets = Array.from({ length: 10 }, (_, i) => ({
        _id: `t${i}`,
        status: 'waiting',
        joinedAt: BASE_NOW + i,
      }));

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.caveats).toContain('very_long');
    });

    it('E20: Non-waiting tickets (called, serving, done) excluded from simulation', () => {
      const dept = { defaultMin: 10 };
      const counters = [{ _id: 'c1', state: 'open' }];
      const tickets = [
        { _id: 't_serving', status: 'serving', joinedAt: BASE_NOW - 1000 },
        { _id: 't_done', status: 'done', joinedAt: BASE_NOW - 2000 },
        { _id: 't_waiting', status: 'waiting', joinedAt: BASE_NOW },
      ];

      const res = computeSnapshot({
        department: dept,
        counters,
        tickets,
        now: BASE_NOW,
      });

      expect(res.tickets.length).toBe(1);
      expect(res.tickets[0].ticketId).toBe('t_waiting');
    });
  });

  describe('4.3 Property Tests (1,000 Random Queues)', () => {
    // Seeded Linear Congruential Generator (LCG) for reproducible randomness
    let seed = 42;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    it('Invariants hold across 1,000 random queues', () => {
      for (let q = 0; q < 1000; q++) {
        const defaultMin = Math.floor(rand() * 40) + 5; // 5 to 45 min
        const n = Math.floor(rand() * 25);
        const mean = defaultMin + (rand() * 10 - 5);
        const m2 = rand() * 100;

        const numCounters = Math.floor(rand() * 4) + 1; // 1 to 4 counters
        const counters = Array.from({ length: numCounters }, (_, i) => ({
          _id: `c_${i}`,
          state: 'open',
          delayUntil: rand() > 0.8 ? BASE_NOW + rand() * 20 * 60000 : null,
        }));

        const numTickets = Math.floor(rand() * 12); // 0 to 12 tickets
        const tickets = Array.from({ length: numTickets }, (_, i) => ({
          _id: `t_${i}`,
          status: 'waiting',
          urgent: rand() > 0.9,
          urgentAt: BASE_NOW + Math.floor(rand() * 10000),
          sortKey: BASE_NOW + Math.floor(rand() * 100000),
          joinedAt: BASE_NOW + i * 1000,
        }));

        const res = computeSnapshot({
          department: { defaultMin, stats: { n, mean, m2 } },
          counters,
          tickets,
          now: BASE_NOW,
        });

        // Invariant 1: low <= mid <= high for every waiting ticket
        for (const t of res.tickets) {
          expect(t.low).toBeLessThanOrEqual(t.mid);
          expect(t.mid).toBeLessThanOrEqual(t.high);
          expect(t.low).toBeGreaterThanOrEqual(0);
        }

        // Invariant 2: low <= mid <= high for new joiner
        expect(res.newJoiner.low).toBeLessThanOrEqual(res.newJoiner.mid);
        expect(res.newJoiner.mid).toBeLessThanOrEqual(res.newJoiner.high);

        // Invariant 3: monotonic rank ordering on single counter
        if (numCounters === 1 && res.tickets.length > 1) {
          for (let i = 1; i < res.tickets.length; i++) {
            expect(res.tickets[i].mid).toBeGreaterThanOrEqual(res.tickets[i - 1].mid);
          }
        }
      }
    });

    it('Adding an open counter never increases any ticket mid ETA', () => {
      const dept = { defaultMin: 15 };
      const tickets = [
        { _id: 't1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
        { _id: 't3', status: 'waiting', joinedAt: BASE_NOW + 2000 },
      ];

      const res1 = computeSnapshot({
        department: dept,
        counters: [{ _id: 'c1', state: 'open' }],
        tickets,
        now: BASE_NOW,
      });

      const res2 = computeSnapshot({
        department: dept,
        counters: [{ _id: 'c1', state: 'open' }, { _id: 'c2', state: 'open' }],
        tickets,
        now: BASE_NOW,
      });

      for (let i = 0; i < tickets.length; i++) {
        expect(res2.tickets[i].mid).toBeLessThanOrEqual(res1.tickets[i].mid);
      }
    });

    it('Adding a delay never decreases any ticket mid ETA', () => {
      const dept = { defaultMin: 15 };
      const tickets = [
        { _id: 't1', status: 'waiting', joinedAt: BASE_NOW },
        { _id: 't2', status: 'waiting', joinedAt: BASE_NOW + 1000 },
      ];

      const noDelay = computeSnapshot({
        department: dept,
        counters: [{ _id: 'c1', state: 'open' }],
        tickets,
        now: BASE_NOW,
      });

      const withDelay = computeSnapshot({
        department: dept,
        counters: [{ _id: 'c1', state: 'open', delayUntil: BASE_NOW + 15 * 60000 }],
        tickets,
        now: BASE_NOW,
      });

      for (let i = 0; i < tickets.length; i++) {
        expect(withDelay.tickets[i].mid).toBeGreaterThanOrEqual(noDelay.tickets[i].mid);
      }
    });
  });

  describe('4.4 Welford Batch Equivalence (1e-9 tolerance)', () => {
    it('Online Welford calculation matches batch mean and sample variance', () => {
      const samples = [14.2, 11.5, 18.0, 13.7, 16.4, 12.1, 15.8, 14.9, 13.0, 17.5];

      // 1. Batch computation
      const n = samples.length;
      const batchMean = samples.reduce((a, b) => a + b, 0) / n;
      const batchM2 = samples.reduce((acc, x) => acc + Math.pow(x - batchMean, 2), 0);
      const batchVar = batchM2 / (n - 1);

      // 2. Sequential Welford updates
      let state = { n: 0, mean: 0, m2: 0 };
      for (const s of samples) {
        state = updateStats(state, s, 15);
      }

      const welfordVar = state.m2 / (state.n - 1);

      expect(Math.abs(state.mean - batchMean)).toBeLessThan(1e-9);
      expect(Math.abs(welfordVar - batchVar)).toBeLessThan(1e-9);
    });
  });

  describe('4.5 Change Logger & Idle Drift Invariance', () => {
    it('Absolute time comparison avoids spurious changes during idle drift', () => {
      const dept = { defaultMin: 25 };
      const counters = [
        {
          _id: 'c1',
          state: 'open',
          status: 'serving',
          startedAt: BASE_NOW - 2 * 60000,
        },
      ];
      const tickets = [{ _id: 't1', token: 'T1', status: 'waiting', joinedAt: BASE_NOW }];

      // Initial compute at T = 0
      const snap0 = computeSnapshot({ department: dept, counters, tickets, now: BASE_NOW });
      const initialStartMs = snap0.tickets[0].startMs;

      // Simulate 10 minutes of clock advancement with no queue mutations
      for (let min = 1; min <= 10; min++) {
        const advancedTime = BASE_NOW + min * 60000;
        const snapDrift = computeSnapshot({
          department: dept,
          counters,
          tickets,
          now: advancedTime,
        });

        // The predicted absolute start time remains constant
        const currentStartMs = snapDrift.tickets[0].startMs;
        const delta = Math.abs(currentStartMs - initialStartMs);

        // |Δ| < 2 min threshold prevents spurious change entries
        expect(delta).toBeLessThan(RULES.CHANGE_THRESHOLD_MIN * 60000);
      }
    });

    it('Formats reason catalogue strings accurately', () => {
      expect(formatReason('join', { priority: 'senior' })).toBe('A senior patient joined ahead of you');
      expect(formatReason('cancel')).toBe('A patient ahead of you cancelled');
      expect(formatReason('call', { counter: 'Counter 1' })).toBe('A consultation started at Counter 1');
      expect(formatReason('delay_set', { counter: 'Counter 2', minutes: 15, reason: 'Emergency case' }))
        .toBe('Counter 2 reported a 15 min delay — Emergency case');
      expect(formatReason('urgent', { count: 2 })).toBe('2 urgent case(s) will be seen first');
      expect(formatReason('requeue')).toBe('Missed the arrive-by time: moved to the back of the queue once');
    });
  });
});
