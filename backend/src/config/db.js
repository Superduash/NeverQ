// backend/src/config/db.js
// MongoDB Atlas connection via Mongoose (Phase 1.2)

import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[DB] MONGODB_URI is not set. Running without database (mock data only).');
    return;
  }

  try {
    await mongoose.connect(uri, {
      // These are the recommended options for Atlas in 2024+
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('[DB] Connected to MongoDB Atlas');

    mongoose.connection.on('error', (err) => {
      console.error('[DB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] Disconnected from MongoDB');
      isConnected = false;
    });

  } catch (err) {
    console.error('[DB] Failed to connect to MongoDB:', err.message);
    // Don't crash the server — let health check report DB status
  }
}

export function getDBStatus() {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    readyStateLabel: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  };
}
