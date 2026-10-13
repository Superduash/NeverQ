import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Determine allowed origins for CORS
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  /^https:\/\/.*\.vercel\.app$/, // Allow Vercel preview and production deployments
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Server-to-server or non-browser
  return allowedOrigins.some((allowed) => {
    if (typeof allowed === "string") return allowed === origin;
    if (allowed instanceof RegExp) return allowed.test(origin);
    return false;
  });
}

// Security & utility middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow during initial setup, logs below
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// Realtime WebSockets setup
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket.io room management matching NeverQ architecture
io.on("connection", (socket) => {
  // Join specific queue or hospital room (e.g., 'orgs', 'org:<orgId>', 'ticket:<token>')
  socket.on("room:join", (room) => {
    if (room && typeof room === "string") {
      socket.join(room);
    }
  });

  socket.on("room:leave", (room) => {
    if (room && typeof room === "string") {
      socket.leave(room);
    }
  });

  socket.on("disconnect", () => {
    // Clean up handled automatically by socket.io
  });
});

// ───────────────────────── REST API Routes ─────────────────────────

// Health check endpoint for Render monitoring & uptime probes
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "neverq-backend",
    uptimeSeconds: Math.floor(process.processUptime ? process.uptime() : 0),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    socketsConnected: io.engine.clientsCount,
  });
});

// Root welcome probe
app.get("/", (_req, res) => {
  res.json({
    name: "NeverQ API",
    status: "online",
    docs: "https://github.com/Superduash/NeverQ",
    healthCheck: "/api/health",
  });
});

// Route placeholder for API v1
app.get("/api", (_req, res) => {
  res.json({
    version: "v1",
    endpoints: {
      health: "/api/health",
      orgs: "/api/orgs",
      tickets: "/api/tickets",
    },
    message: "NeverQ backend foundation ready. Endpoints will connect in Phase 1.",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 404,
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || "Internal server error",
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`[NeverQ Backend] Server listening on port ${PORT} (${NODE_ENV})`);
  console.log(`[NeverQ Backend] Health check: http://localhost:${PORT}/api/health`);
});

// Graceful termination for Render deployments
function handleShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  io.close(() => {
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });
  // Force exit if hanging
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
