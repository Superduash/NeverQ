// backend/src/db/connect.js
import dns from 'node:dns';
import mongoose from 'mongoose';
import env from '../config/env.js';

// Ensure MongoDB Atlas SRV lookup succeeds across Windows ISP/router DNS limitations
if (typeof dns.setServers === 'function') {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (_e) {
    // Keep default if restricted
  }
}

let isConnected = false;

export async function connectDB(explicitUri = null, retries = 5, delayMs = 1000) {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  const uri = explicitUri || env.MONGODB_URI;
  if (!uri) {
    if (env.NODE_ENV === 'test') {
      return; // Tests using mongodb-memory-server connect explicitly
    }
    console.error('❌ [DB FATAL] MONGODB_URI is not set in environment! NeverQ requires MongoDB Atlas. Exiting.');
    process.exit(1);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        autoIndex: env.NODE_ENV !== 'production' || env.DEMO_MODE,
      });

      isConnected = true;
      console.log('[DB] Connected to MongoDB successfully.');

      mongoose.connection.on('error', (err) => {
        console.error('[DB] Connection error:', err.message);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[DB] Disconnected from MongoDB.');
        isConnected = false;
      });

      return;
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        if (env.NODE_ENV === 'production') {
          console.error('[DB] Fatal: Failed to connect to MongoDB after 5 attempts. Exiting process.');
          process.exit(1);
        } else {
          console.warn('[DB] Development mode: Continuing without MongoDB connection.');
          return;
        }
      }
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
    }
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export function getDBStatus() {
  const state = mongoose.connection.readyState;
  return {
    status: state === 1 ? 'up' : 'down',
    readyState: state,
    connected: state === 1,
  };
}

export async function pingDB() {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }
  try {
    const adminDb = mongoose.connection.db?.admin?.();
    if (adminDb) {
      await adminDb.ping();
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

export default connectDB;
