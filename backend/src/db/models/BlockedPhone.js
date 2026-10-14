// backend/src/db/models/BlockedPhone.js
import mongoose from 'mongoose';

const blockedPhoneSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true, ref: 'Org' },
    phone: { type: String, required: true },
    reason: { type: String, default: 'Abuse/Removal' },
    expireAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 3600 * 1000), // Block expires after 24h
    },
  },
  {
    timestamps: true,
  }
);

// Indexes per §2.2
blockedPhoneSchema.index({ orgId: 1, phone: 1 }, { unique: true });
blockedPhoneSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const BlockedPhone = mongoose.models.BlockedPhone || mongoose.model('BlockedPhone', blockedPhoneSchema);
export default BlockedPhone;
