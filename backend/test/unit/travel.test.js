// backend/test/unit/travel.test.js
// Unit tests for travel-time estimation model, ORS adapter, cache, quotas, and breaker (§5.11)

import { describe, it, expect, beforeEach } from 'vitest';
import { haversine, estimateTravel } from '../../src/services/travel/estimate.js';
import {
  getTravel,
  getIstTrafficFactor,
  resetCircuitBreaker,
} from '../../src/services/travel/ors.js';
import { estimateTravel as frontendEstimateTravel } from '../../../frontend/src/lib/travelModel.js';

describe('Phase 5: Travel-Time Service Unit Tests (§5.11)', () => {
  const BASE_NOW = 1700000000000;
  const DEMO_HOME = { lat: 13.045, lng: 80.245 };
  const HARBOUR = { lat: 13.0338, lng: 80.2676 }; // ~2.75 km

  // Create point at exact straight-line distance in km from DEMO_HOME
  const pointAtKm = (km) => ({
    lat: DEMO_HOME.lat + km / 111.19492664455873,
    lng: DEMO_HOME.lng,
  });

  const P_2_75 = pointAtKm(2.75); // Harbour reference distance
  const P_4_45 = pointAtKm(4.45); // Metro Mercy reference distance
  const P_5_84 = pointAtKm(5.84); // Lakeside reference distance

  beforeEach(() => {
    resetCircuitBreaker();
  });

  describe('T-TR-1 & T-TR-2: Ordering Invariants & Table 5.3 Vectors', () => {
    it('T-TR-2: Table 5.3 verified outputs for Home -> Harbour / Metro Mercy / Lakeside', () => {
      // Home -> Harbour (2.75 km)
      expect(estimateTravel(DEMO_HOME, P_2_75, 'walk').minutes).toBe(44);
      expect(estimateTravel(DEMO_HOME, P_2_75, 'bike').minutes).toBe(16);
      expect(estimateTravel(DEMO_HOME, P_2_75, 'car').minutes).toBe(15);
      expect(estimateTravel(DEMO_HOME, P_2_75, 'car', 1.3).minutes).toBe(18);
      expect(estimateTravel(DEMO_HOME, P_2_75, 'bike', 1.3).minutes).toBe(18);

      // Home -> Metro Mercy (4.45 km)
      expect(estimateTravel(DEMO_HOME, P_4_45, 'walk').minutes).toBe(72);
      expect(estimateTravel(DEMO_HOME, P_4_45, 'bike').minutes).toBe(25);
      expect(estimateTravel(DEMO_HOME, P_4_45, 'car').minutes).toBe(21);
      expect(estimateTravel(DEMO_HOME, P_4_45, 'car', 1.3).minutes).toBe(26);
      expect(estimateTravel(DEMO_HOME, P_4_45, 'bike', 1.3).minutes).toBe(29);

      // Home -> Lakeside (5.84 km)
      expect(estimateTravel(DEMO_HOME, P_5_84, 'walk').minutes).toBe(94);
      expect(estimateTravel(DEMO_HOME, P_5_84, 'bike').minutes).toBe(33);
      expect(estimateTravel(DEMO_HOME, P_5_84, 'car').minutes).toBe(26);
      expect(estimateTravel(DEMO_HOME, P_5_84, 'car', 1.3).minutes).toBe(32);
      expect(estimateTravel(DEMO_HOME, P_5_84, 'bike', 1.3).minutes).toBe(37);
    });

    it('T-TR-2: Straight-line distance benchmark table (§5.3)', () => {
      const testDistances = [
        { km: 0.3, expected: { walk: 5, bike: 3, car: 6 } },
        { km: 0.8, expected: { walk: 13, bike: 6, car: 7 } },
        { km: 1.2, expected: { walk: 20, bike: 8, car: 9 } },
        { km: 1.8, expected: { walk: 29, bike: 11, car: 11 } },
        { km: 2.0, expected: { walk: [32, 33], bike: 12, car: 12 } },
        { km: 3.0, expected: { walk: 49, bike: 18, car: 16 } },
        { km: 5.0, expected: { walk: [80, 81], bike: 28, car: 23 } },
        { km: 8.0, expected: { walk: [128, 129], bike: 44, car: 34 } },
      ];

      for (const t of testDistances) {
        const dest = pointAtKm(t.km);
        const walk = estimateTravel(DEMO_HOME, dest, 'walk').minutes;
        const bike = estimateTravel(DEMO_HOME, dest, 'bike').minutes;
        const car = estimateTravel(DEMO_HOME, dest, 'car').minutes;

        if (Array.isArray(t.expected.walk)) {
          expect(t.expected.walk).toContain(walk);
        } else {
          expect(walk).toBe(t.expected.walk);
        }
        expect(bike).toBe(t.expected.bike);
        expect(car).toBe(t.expected.car);
      }
    });

    it('T-TR-1: Ordering invariants over 500 random pairs', () => {
      let seed = 12345;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < 500; i++) {
        // Generate coordinates around Chennai (13.0, 80.2)
        const from = { lat: 13.0 + (rand() - 0.5) * 0.4, lng: 80.2 + (rand() - 0.5) * 0.4 };
        const to = { lat: 13.0 + (rand() - 0.5) * 0.4, lng: 80.2 + (rand() - 0.5) * 0.4 };

        const straight = haversine(from, to);
        const walk = estimateTravel(from, to, 'walk').minutes;
        const bike = estimateTravel(from, to, 'bike').minutes;
        const car = estimateTravel(from, to, 'car').minutes;

        // Invariant 1: walk >= bike always
        expect(walk).toBeGreaterThanOrEqual(bike);

        // Invariant 2: at straight-line distance >= 2.0 km: car <= bike <= walk
        if (straight >= 2.0) {
          expect(car).toBeLessThanOrEqual(bike);
          expect(bike).toBeLessThanOrEqual(walk);
        }
      }
    });

    it('T-TR-3: Same point returns 1 min, 0.0 km without exception', () => {
      const p = { lat: 13.045, lng: 80.245 };
      for (const mode of ['walk', 'bike', 'car']) {
        const res = estimateTravel(p, p, mode);
        expect(res.minutes).toBe(1);
        expect(res.km).toBe(0.0);
      }
    });
  });

  describe('T-TR-5: Parity with Frontend Travel Model', () => {
    it('Backend estimateTravel and Frontend travelModel produce 100% identical outputs', () => {
      let seed = 999;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const modes = ['walk', 'bike', 'car'];
      const rushFactors = [1.0, 1.3, 1.6];

      for (let i = 0; i < 200; i++) {
        const from = { lat: 12.8 + rand() * 0.5, lng: 80.0 + rand() * 0.5 };
        const to = { lat: 12.8 + rand() * 0.5, lng: 80.0 + rand() * 0.5 };

        for (const mode of modes) {
          for (const rush of rushFactors) {
            const backRes = estimateTravel(from, to, mode, rush);
            const frontRes = frontendEstimateTravel(from, to, mode, rush);

            expect(backRes.minutes).toBe(frontRes.minutes);
            expect(backRes.km).toBe(frontRes.km);
            expect(backRes.source).toBe(frontRes.source);
            expect(backRes.label).toBe(frontRes.label);
          }
        }
      }
    });
  });

  describe('T-TR-6 & T-TR-12: ORS Unit Conversion & IST Time-of-Day Traffic Multiplier', () => {
    it('T-TR-6: Unit conversion from meters/seconds with time-of-day multiplier', async () => {
      // Mock ORS returning 3,500 m and 480 s (8 min)
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: { summary: { distance: 3500, duration: 480 } },
              geometry: { coordinates: [[80.245, 13.045], [80.2676, 13.0338]] },
            },
          ],
        }),
      });

      // Midday in IST (e.g., 14:00 IST -> multiplier 1.25)
      // UTC 08:30 is 14:00 IST
      const middayUtcMs = new Date('2026-10-14T08:30:00Z').getTime();
      expect(getIstTrafficFactor(middayUtcMs)).toBe(1.25);

      const carResMidday = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: middayUtcMs,
        fetchFn: mockFetch,
      });

      // Distance: 3500 m -> 3.5 km
      // Duration: 480 s = 8 min. Car midday traffic = 8 * 1.25 = 10 min. Overhead = 4 min. Total = 14 min.
      expect(carResMidday.km).toBe(3.5);
      expect(carResMidday.minutes).toBe(14);
      expect(carResMidday.source).toBe('route');
      expect(carResMidday.trafficFactor).toBe(1.25);

      // Night in IST (e.g., 01:00 IST -> multiplier 1.0)
      // UTC 19:30 is 01:00 IST next day
      const nightUtcMs = new Date('2026-10-14T19:30:00Z').getTime();
      expect(getIstTrafficFactor(nightUtcMs)).toBe(1.0);

      const carResNight = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: nightUtcMs,
        fetchFn: mockFetch,
      });
      // 8 * 1.0 = 8 min + 4 overhead = 12 min
      expect(carResNight.minutes).toBe(12);
      expect(carResNight.trafficFactor).toBe(1.0);
    });

    it('T-TR-12: Demo clock fast-forward into 18:00 IST (peak traffic 1.5)', async () => {
      // 18:00 IST is UTC 12:30
      const peakUtcMs = new Date('2026-10-14T12:30:00Z').getTime();
      expect(getIstTrafficFactor(peakUtcMs)).toBe(1.5);

      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: { summary: { distance: 3500, duration: 480 } },
              geometry: { coordinates: [] },
            },
          ],
        }),
      });

      const carResPeak = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: peakUtcMs,
        fetchFn: mockFetch,
      });

      // 8 min * 1.5 = 12 min + 4 overhead = 16 min
      expect(carResPeak.minutes).toBe(16);
      expect(carResPeak.trafficFactor).toBe(1.5);
    });
  });

  describe('T-TR-7, T-TR-8, T-TR-10: Caching, Fallbacks & Circuit Breaker', () => {
    it('T-TR-8: Cache hit returns cached raw route and avoids second upstream call', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                properties: { summary: { distance: 3000, duration: 300 } },
                geometry: { coordinates: [[80.2, 13.0], [80.21, 13.01]] },
              },
            ],
          }),
        };
      };

      const res1 = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: BASE_NOW,
        fetchFn: mockFetch,
      });
      expect(res1.cached).toBe(false);
      expect(callCount).toBe(1);

      // Second identical call
      const res2 = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: BASE_NOW,
        fetchFn: mockFetch,
      });
      expect(res2.cached).toBe(true);
      expect(res2.source).toBe('route');
      expect(callCount).toBe(1); // No new network call
    });

    it('T-TR-7: ORS error, 404, or timeout gracefully falls back to estimate', async () => {
      // 1. Timeout simulation
      const timeoutFetch = async () => {
        const err = new Error('Request aborted');
        err.name = 'AbortError';
        throw err;
      };

      const timeoutRes = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'car',
        now: BASE_NOW,
        fetchFn: timeoutFetch,
      });
      expect(timeoutRes.source).toBe('estimate');
      expect(timeoutRes.fallbackReason).toBe('TIMEOUT');
      expect(timeoutRes.minutes).toBe(15);

      // 2. 404 No Route
      resetCircuitBreaker();
      const notFoundFetch = async () => ({ ok: false, status: 404 });
      const notFoundRes = await getTravel({
        from: DEMO_HOME,
        to: HARBOUR,
        mode: 'bike',
        now: BASE_NOW,
        fetchFn: notFoundFetch,
      });
      expect(notFoundRes.source).toBe('estimate');
      expect(notFoundRes.fallbackReason).toBe('NO_ROUTE');
      expect(notFoundRes.minutes).toBe(16);
    });

    it('T-TR-10: Circuit breaker opens after 3 consecutive failures', async () => {
      let callAttempts = 0;
      const failingFetch = async () => {
        callAttempts++;
        return { ok: false, status: 500 };
      };

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        const r = await getTravel({
          from: { lat: 13.0 + i * 0.01, lng: 80.2 },
          to: HARBOUR,
          mode: 'car',
          now: BASE_NOW,
          fetchFn: failingFetch,
        });
        expect(r.source).toBe('estimate');
      }
      expect(callAttempts).toBe(3);

      // 4th call: breaker is now OPEN. Upstream fetch must NOT be called
      const breakerRes = await getTravel({
        from: { lat: 13.05, lng: 80.2 },
        to: HARBOUR,
        mode: 'car',
        now: BASE_NOW,
        fetchFn: failingFetch,
      });

      expect(breakerRes.source).toBe('estimate');
      expect(breakerRes.fallbackReason).toBe('BREAKER');
      expect(callAttempts).toBe(3); // Upstream was not called!
    });

    it('T-TR-11: Rush hour factor 1.3 increases car time most while walk is unaffected', () => {
      const baseCar = estimateTravel(DEMO_HOME, P_5_84, 'car', 1.0).minutes; // 26
      const rushCar = estimateTravel(DEMO_HOME, P_5_84, 'car', 1.3).minutes; // 32
      const carDelta = rushCar - baseCar; // +6 min

      const baseBike = estimateTravel(DEMO_HOME, P_5_84, 'bike', 1.0).minutes; // 33
      const rushBike = estimateTravel(DEMO_HOME, P_5_84, 'bike', 1.3).minutes; // 37
      const bikeDelta = rushBike - baseBike; // +4 min

      const baseWalk = estimateTravel(DEMO_HOME, P_5_84, 'walk', 1.0).minutes; // 94
      const rushWalk = estimateTravel(DEMO_HOME, P_5_84, 'walk', 1.3).minutes; // 94
      const walkDelta = rushWalk - baseWalk; // 0 min

      expect(walkDelta).toBe(0);
      expect(carDelta).toBeGreaterThan(bikeDelta);
      expect(bikeDelta).toBeGreaterThan(walkDelta);
    });
  });
});
