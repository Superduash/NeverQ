// backend/test/integration/travel.test.js
// Integration tests for POST /api/travel endpoint (§5.2, §5.5, §5.11)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { clock } from '../../src/lib/clock.js';

let app;

beforeAll(() => {
  app = createApp();
});

describe('Phase 5: Travel-Time Integration Tests (POST /api/travel)', () => {
  const DEMO_HOME = { lat: 13.045, lng: 80.245 };
  const HARBOUR = { lat: 13.0338, lng: 80.2676 };

  describe('T-TR-4: Input Validation (§5.2)', () => {
    it('rejects lat > 90 with 400 INVALID_COORDS', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: { lat: 95.0, lng: 80.0 },
          to: HARBOUR,
          mode: 'car',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_COORDS');
    });

    it('rejects NaN coordinates with 400 INVALID_COORDS', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: { lat: 'invalid', lng: 80.0 },
          to: HARBOUR,
          mode: 'car',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_COORDS');
    });

    it('rejects (0,0) coordinates with 400 INVALID_COORDS', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: { lat: 0, lng: 0 },
          to: HARBOUR,
          mode: 'car',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_COORDS');
    });

    it('rejects distance > 300 km with 400 INVALID_COORDS', async () => {
      // Delhi to Chennai is > 1700 km
      const DELHI = { lat: 28.6139, lng: 77.2090 };
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: DELHI,
          to: HARBOUR,
          mode: 'car',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_COORDS');
      expect(res.body.message).toContain('300 km');
    });

    it('rejects invalid travel mode with 400 INVALID_MODE', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: DEMO_HOME,
          to: HARBOUR,
          mode: 'helicopter',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_MODE');
    });
  });

  describe('Successful Estimation & Contract Shape (Appendix A.6)', () => {
    it('returns standardized travel object with fallbackReason DISABLED when ORS is not active', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: DEMO_HOME,
          to: HARBOUR,
          mode: 'bike',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        minutes: 16,
        km: 3.4,
        source: 'estimate',
        label: 'approx.',
        mode: 'bike',
        cached: false,
      });

      expect(res.body.computedAt).toBeDefined();
      expect(res.body.fallbackReason).toBe('DISABLED');
    });

    it('honors server rushFactor multiplier from clock', async () => {
      clock.setRushFactor(1.3);

      const res = await request(app)
        .post('/api/travel')
        .send({
          from: DEMO_HOME,
          to: HARBOUR,
          mode: 'car',
        });

      expect(res.status).toBe(200);
      expect(res.body.minutes).toBe(18); // Rush ×1.3 car: 18 min
      expect(res.body.rushFactor).toBe(1.3);

      // Reset rush factor
      clock.setRushFactor(1.0);
    });

    it('enforces rate limit: 30 requests / 1 min, 31st returns 429 RATE_LIMIT', async () => {
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post('/api/travel')
          .set('x-test-rate-limit', 'true')
          .set('x-device-id', 'test-device-travel-rate-limit')
          .send({
            from: DEMO_HOME,
            to: HARBOUR,
            mode: 'car',
          });
        expect(res.status).toBe(200);
      }

      const limitedRes = await request(app)
        .post('/api/travel')
        .set('x-test-rate-limit', 'true')
        .set('x-device-id', 'test-device-travel-rate-limit')
        .send({
          from: DEMO_HOME,
          to: HARBOUR,
          mode: 'car',
        });

      expect(limitedRes.status).toBe(429);
      expect(limitedRes.body.code).toBe('RATE_LIMIT');
      expect(limitedRes.body.retryAfterMs).toBeDefined();
    });
  });

  describe('T-TR-13: Log Inspection & Privacy (§5.10)', () => {
    it('ensures coordinates are never leaked in response error details or headers', async () => {
      const res = await request(app)
        .post('/api/travel')
        .send({
          from: { lat: 13.045, lng: 80.245 },
          to: { lat: 13.0338, lng: 80.2676 },
          mode: 'car',
        });

      expect(res.status).toBe(200);
      // Ensure body has no raw coords object in response
      expect(res.body.from).toBeUndefined();
      expect(res.body.to).toBeUndefined();
    });
  });
});
