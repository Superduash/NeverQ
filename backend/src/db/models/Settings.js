// backend/src/db/models/Settings.js
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    clockOffsetMs: { type: Number, default: 0 },
    rushFactor: { type: Number, default: 1 },
    lastSweepAt: { type: Number, default: 0 }, // real ms
    tokenEpoch: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
export default Settings;
