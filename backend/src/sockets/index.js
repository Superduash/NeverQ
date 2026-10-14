// backend/src/sockets/index.js
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const ROOM_NAME_REGEX = /^(orgs|admin|org:[a-z0-9-]{1,40}|ticket:[A-Za-z0-9_-]{16,40})$/;
const MAX_ROOMS_PER_SOCKET = 12;

export function setupSockets(httpServer, corsOptions) {
  const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
  });

  // Handshake authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token && typeof token === 'string') {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        socket.data.role = decoded.role;
        socket.data.orgId = decoded.orgId;
      } catch (_err) {
        // Missing or invalid token does NOT reject connection (customers are anonymous)
        socket.data.role = 'anonymous';
      }
    } else {
      socket.data.role = 'anonymous';
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('room:join', (room) => {
      if (typeof room !== 'string' || !ROOM_NAME_REGEX.test(room)) {
        return socket.emit('room:denied', { room, reason: 'INVALID_ROOM_NAME' });
      }

      // Check admin permission
      if (room === 'admin' && socket.data.role !== 'admin') {
        return socket.emit('room:denied', { room, reason: 'ADMIN_AUTH_REQUIRED' });
      }

      // Room count check (socket.rooms includes socket.id)
      const userRooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      if (userRooms.length >= MAX_ROOMS_PER_SOCKET && !socket.rooms.has(room)) {
        return socket.emit('room:denied', { room, reason: 'MAX_ROOMS_EXCEEDED' });
      }

      socket.join(room);
    });

    socket.on('room:leave', (room) => {
      if (typeof room === 'string') {
        socket.leave(room);
      }
    });
  });

  return io;
}

export default setupSockets;
