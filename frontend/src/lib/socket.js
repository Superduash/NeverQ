// NeverQ Socket Singleton & Realtime Hooks (NeverQ2 §8, §9)
// Seamless switch between mock event emitter and real socket.io

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { mockEmitter } from './mock/engine.js';
import { useOnline } from './utils.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

class SocketManager {
  constructor() {
    this.socket = null;
    this.rooms = new Set();
    this.statusListeners = new Set();
    this.state = 'connected'; // 'connected' | 'reconnecting' | 'disconnected'

    if (!USE_MOCK) {
      this.initRealSocket();
    }
  }

  initRealSocket() {
    const staffToken = localStorage.getItem('nq-staff-token');
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: staffToken ? { token: staffToken } : undefined,
    });

    this.socket.on('connect', () => {
      this.updateState('connected');
      // Re-join active rooms
      this.rooms.forEach((room) => this.socket.emit('room:join', room));
    });

    this.socket.on('reconnect_attempt', () => {
      this.updateState('reconnecting');
    });

    this.socket.on('disconnect', () => {
      this.updateState('disconnected');
    });
  }

  updateState(newState) {
    this.state = newState;
    this.statusListeners.forEach((fn) => fn(newState));
  }

  joinRoom(room) {
    if (!room) return;
    this.rooms.add(room);
    if (!USE_MOCK && this.socket?.connected) {
      this.socket.emit('room:join', room);
    }
  }

  leaveRoom(room) {
    if (!room) return;
    this.rooms.delete(room);
    if (!USE_MOCK && this.socket?.connected) {
      this.socket.emit('room:leave', room);
    }
  }

  on(event, handler) {
    if (USE_MOCK) {
      return mockEmitter.on(event, handler);
    }
    this.socket?.on(event, handler);
    return () => this.socket?.off(event, handler);
  }
}

export const socketManager = new SocketManager();

// Hook to subscribe to a room and listen for socket events
export function useSocketRoom(room, event, handler) {
  useEffect(() => {
    if (!room) return;
    socketManager.joinRoom(room);

    const unsub = socketManager.on(event, (payload) => {
      if (handler) handler(payload);
    });

    return () => {
      unsub();
      socketManager.leaveRoom(room);
    };
  }, [room, event, handler]);
}

// Resilient Live Data hook with 10s polling safety net
export function useLiveData(fetcher, { room, event = 'queue:update', interval = 10000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isOnline = useOnline();

  const load = useCallback(async () => {
    try {
      const res = await fetcher();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Socket listener for instant updates
  useEffect(() => {
    if (room) socketManager.joinRoom(room);

    const unsub = socketManager.on(event, () => {
      load();
    });

    return () => {
      unsub();
      if (room) socketManager.leaveRoom(room);
    };
  }, [room, event, load]);

  // Polling safety net
  useEffect(() => {
    if (!interval || !isOnline) return;
    const timer = setInterval(() => {
      load();
    }, interval);
    return () => clearInterval(timer);
  }, [interval, isOnline, load]);

  // Visibility change refetch (tab reactivation)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isOnline) {
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [load, isOnline]);

  return { data, loading, error, refresh: load };
}

// Helper hook to read socket status
export function useSocketStatus() {
  const [status, setStatus] = useState(socketManager.state);

  useEffect(() => {
    const unsub = (newStatus) => setStatus(newStatus);
    socketManager.statusListeners.add(unsub);
    return () => socketManager.statusListeners.delete(unsub);
  }, []);

  return status;
}

