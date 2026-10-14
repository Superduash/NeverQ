// backend/test/integration/health.test.js
import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io as ClientIO } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { createApp, corsOptions } from '../../src/app.js';
import { setupSockets } from '../../src/sockets/index.js';
import env from '../../src/config/env.js';

describe('Phase 1 - Foundation & Health Integration Tests', () => {
  let server;
  let io;
  let app;
  let serverPort;

  beforeAll(async () => {
    server = http.createServer();
    io = setupSockets(server, corsOptions);
    app = createApp({ io });
    server.on('request', app);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/health returns 200 with required status fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('serverNow');
    expect(res.body).toHaveProperty('sockets');
  });

  it('GET /api/meta returns serverNow, clockOffsetMs, rushFactor, and demo status', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('serverNow');
    expect(res.body).toHaveProperty('clockOffsetMs');
    expect(res.body).toHaveProperty('rushFactor');
    expect(res.body).toHaveProperty('demo');
    expect(res.body).toHaveProperty('version');
  });

  it('sets X-NQ-Server-Now, X-NQ-Clock-Offset-Ms, and X-Request-Id headers and exposes them', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers).toHaveProperty('x-nq-server-now');
    expect(res.headers).toHaveProperty('x-nq-clock-offset-ms');
    expect(res.headers).toHaveProperty('x-request-id');
    expect(res.headers['access-control-expose-headers']).toContain('X-NQ-Server-Now');
    expect(res.headers['access-control-expose-headers']).toContain('X-NQ-Clock-Offset-Ms');
    expect(res.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('CORS accepts allowed origins and rejects unknown origins without CORS headers', async () => {
    // 1. Allowed origin
    const resAllowed = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(resAllowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    // 2. Unknown origin
    const resUnknown = await request(app)
      .get('/api/health')
      .set('Origin', 'http://malicious-site.example.com');
    expect(resUnknown.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responds with 404 AppError JSON for unmatched routes', async () => {
    const res = await request(app).get('/api/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('status', 404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body).toHaveProperty('requestId');
  });

  it('responds with 400 VALIDATION_ERROR for malformed JSON request bodies', async () => {
    const res = await request(app)
      .post('/api/_debug/ping-socket')
      .set('Content-Type', 'application/json')
      .send('{ bad json: ');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res.body).toHaveProperty('requestId');
  });

  it('responds with 400 VALIDATION_ERROR for non-JSON content-type on POST', async () => {
    const res = await request(app)
      .post('/api/_debug/ping-socket')
      .set('Content-Type', 'text/plain')
      .send('not a json object');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res.body).toHaveProperty('requestId');
  });

  it('Socket.IO connection and room policies', async () => {
    const client = ClientIO(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });

    await new Promise((resolve) => client.on('connect', resolve));
    expect(client.connected).toBe(true);

    // 1. Join valid room
    client.emit('room:join', 'orgs');

    // 2. Join invalid room format -> receives room:denied
    const deniedPromise = new Promise((resolve) => {
      client.on('room:denied', (data) => {
        resolve(data);
      });
    });
    client.emit('room:join', 'invalid room name $$$');
    const deniedData = await deniedPromise;
    expect(deniedData).toEqual({
      room: 'invalid room name $$$',
      reason: 'INVALID_ROOM_NAME',
    });

    // 3. Anonymous joining admin room -> rejected
    const adminDeniedPromise = new Promise((resolve) => {
      client.once('room:denied', (data) => {
        resolve(data);
      });
    });
    client.emit('room:join', 'admin');
    const adminDenied = await adminDeniedPromise;
    expect(adminDenied).toEqual({
      room: 'admin',
      reason: 'ADMIN_AUTH_REQUIRED',
    });

    // 4. Debug event triggers queue:update in room 'orgs'
    const debugUpdatePromise = new Promise((resolve) => {
      client.on('queue:update', (payload) => {
        resolve(payload);
      });
    });

    await request(app).post('/api/_debug/ping-socket');
    const debugPayload = await debugUpdatePromise;
    expect(debugPayload).toEqual({ reason: 'debug' });

    client.disconnect();
  });

  it('Socket.IO authenticated admin connection can join admin room', async () => {
    const adminToken = jwt.sign({ role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' });

    const adminClient = ClientIO(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { token: adminToken },
    });

    await new Promise((resolve) => adminClient.on('connect', resolve));
    expect(adminClient.connected).toBe(true);

    let deniedCalled = false;
    adminClient.on('room:denied', () => {
      deniedCalled = true;
    });

    adminClient.emit('room:join', 'admin');
    await new Promise((r) => setTimeout(r, 100));
    expect(deniedCalled).toBe(false);

    adminClient.disconnect();
  });
});
