// backend/src/db/models/ApiUsage.js
import mongoose from 'mongoose';

const apiUsageSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. 'ors:2026-10-14'
    count: { type: Number, default: 0 },
    expireAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 48 * 3600 * 1000), // Retain for 48h
    },
  },
  {
    timestamps: true,
  }
);

apiUsageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const ApiUsage = mongoose.models.ApiUsage || mongoose.model('ApiUsage', apiUsageSchema);
export default ApiUsage;
