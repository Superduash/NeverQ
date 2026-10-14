// backend/src/app.js
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import env from './config/env.js';
import { clock, now } from './lib/clock.js';
import { getDBStatus, pingDB } from './db/connect.js';
import { requestId } from './middleware/requestId.js';
import { serverTime } from './middleware/serverTime.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './lib/errors.js';
import staffRouter from './routes/staff.js';
import adminRouter from './routes/admin.js';
import orgsRouter from './routes/orgs.js';
import ticketsRouter from './routes/tickets.js';
import travelRouter from './routes/travel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct allowed origins list
const explicitOrigins = [
  ...env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
];

export function isOriginAllowed(origin) {
  if (!origin) return true; // Allow non-browser, server-to-server, or test requests
  if (explicitOrigins.includes(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      // Do not set CORS headers for unknown origins
      callback(null, false);
    }
  },
  credentials: false,
  exposedHeaders: ['X-NQ-Server-Now', 'X-NQ-Clock-Offset-Ms', 'X-Request-Id'],
};

export function createApp({ io = null } = {}) {
  const app = express();

  // 1. Trust proxy (needed behind Render proxy for correct client IPs)
  app.set('trust proxy', 1);

  // 2. Request ID
  app.use(requestId);

  // 3. Helmet security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // 4. CORS with explicit allow-list
  app.use(cors(corsOptions));

  // 5. JSON parsing with 20kb limit
  app.use(express.json({ limit: '20kb' }));

  // Reject non-JSON bodies on POST/PUT/PATCH to /api with VALIDATION_ERROR
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.path.startsWith('/api')) {
      const contentLength = req.headers['content-length'];
      const contentType = req.headers['content-type'];
      if (contentLength && contentLength !== '0' && (!contentType || !contentType.includes('application/json'))) {
        return next(new AppError('VALIDATION_ERROR', 400, 'Content-Type must be application/json'));
      }
    }
    next();
  });

  // 6. Server time headers on every response
  app.use(serverTime);

  // 7. Morgan logging - method + path only (no query strings or bodies for privacy)
  morgan.token('safe-url', (req) => {
    const raw = req.originalUrl || req.url || '';
    return raw.split('?')[0];
  });

  if (env.NODE_ENV !== 'test') {
    app.use(
      morgan(':method :safe-url :status :response-time ms - :res[content-length]')
    );
  }

  // ───────────────────────── Base Endpoints ─────────────────────────

  // Health check - always 200 (for keep-awake and liveness monitoring)
  app.get('/api/health', (_req, res) => {
    const dbInfo = getDBStatus();
    res.status(200).json({
      status: 'ok',
      db: dbInfo.status,
      uptimeSeconds: Math.floor(process.uptime()),
      serverNow: now(),
      sockets: io?.engine?.clientsCount ?? 0,
    });
  });

  // Ready check - 200 or 503 based on database ping
  app.get('/api/ready', async (_req, res) => {
    const isReady = await pingDB();
    if (isReady) {
      return res.status(200).json({ status: 'ready', db: 'up' });
    }
    return res.status(503).json({ status: 'not_ready', db: 'down' });
  });

  // Meta endpoint (Appendix A.1)
  app.get('/api/meta', (_req, res) => {
    res.status(200).json({
      serverNow: now(),
      clockOffsetMs: clock.getOffsetMs(),
      rushFactor: clock.getRushFactor(),
      demo: env.DEMO_MODE,
      version: '0.1.0',
    });
  });

  // Debug event for checkpoint verification (non-production or demo mode)
  if (env.NODE_ENV !== 'production' || env.DEMO_MODE) {
    app.post('/api/_debug/ping-socket', (_req, res) => {
      if (io) {
        io.to('orgs').emit('queue:update', { reason: 'debug' });
      }
      res.json({ ok: true, emitted: 'queue:update', room: 'orgs' });
    });
  }

  // ───────────────────────── API Routes ─────────────────────────
  app.use('/api/staff', staffRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/orgs', orgsRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/travel', travelRouter);

  // Root welcome probe
  app.get('/', (_req, res, next) => {
    if (env.SERVE_STATIC) return next();
    res.json({
      name: 'NeverQ API',
      status: 'online',
      docs: 'https://github.com/Superduash/NeverQ',
      healthCheck: '/api/health',
      meta: '/api/meta',
    });
  });

  // 1.5 Static serving (same-origin mode)
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  if (env.SERVE_STATIC && fs.existsSync(distPath)) {
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.includes('workbox-')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    // SPA fallback for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 8. 404 Handler for unmatched API routes
  app.use((req, _res, next) => {
    next(new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl.split('?')[0]}`));
  });

  // 9. Central error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
