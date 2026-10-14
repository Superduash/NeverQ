// backend/src/server.js
import http from 'node:http';
import env from './config/env.js';
import { createApp, corsOptions } from './app.js';
import { setupSockets } from './sockets/index.js';
import { connectDB, disconnectDB } from './db/connect.js';

const server = http.createServer();
const io = setupSockets(server, corsOptions);
const app = createApp({ io });

server.on('request', app);

async function startServer() {
  // Connect to database (with backoff retries)
  await connectDB();

  server.listen(env.PORT, () => {
    console.log(`[NeverQ Backend] Server running on port ${env.PORT} (${env.NODE_ENV})`);
    console.log(`[NeverQ Backend] Health check: http://localhost:${env.PORT}/api/health`);
    console.log(`[NeverQ Backend] Meta info:    http://localhost:${env.PORT}/api/meta`);
  });
}

// Graceful shutdown handling
async function shutdown(signal) {
  console.log(`\n[NeverQ Backend] ${signal} received. Closing gracefully...`);
  io.close(() => {
    console.log('[NeverQ Backend] Socket.IO connections closed.');
  });

  server.close(async () => {
    console.log('[NeverQ Backend] HTTP server closed.');
    await disconnectDB();
    console.log('[NeverQ Backend] MongoDB disconnected. Process exiting.');
    process.exit(0);
  });

  // Force close after 10s if dangling connections remain
  setTimeout(() => {
    console.error('[NeverQ Backend] Forcefully shutting down after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch((err) => {
  console.error('[NeverQ Backend] Failed to start server:', err);
  process.exit(1);
});

export { server, app, io };
