// backend/src/db/models/Org.js
import mongoose from 'mongoose';

const rulesSchema = new mongoose.Schema(
  {
    priorityCreditMin: {
      senior: { type: Number, default: 20, min: 0, max: 120 },
      pregnant: { type: Number, default: 20, min: 0, max: 120 },
      disabled: { type: Number, default: 20, min: 0, max: 120 },
      none: { type: Number, default: 0, min: 0, max: 0 },
    },
    arriveByMin: { type: Number, default: 15, min: 1, max: 60 },
    graceMin: { type: Number, default: 5, min: 1, max: 30 },
    remoteCap: { type: Number, default: 10, min: 0, max: 100 },
    remoteEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const orgSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // slug: 'harbour', 'lakeside', etc.
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    category: { type: String, default: 'hospital' },
    demo: { type: Boolean, default: true },
    seeded: { type: Boolean, default: false },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    area: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    hours: { type: String, default: '08:00–20:00' },
    open: { type: Boolean, default: true },
    rules: { type: rulesSchema, default: () => ({}) },
    staffPinHash: { type: String, required: true, select: false },
    pinVersion: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.staffPinHash; // Never leak PIN hash to frontend
        return ret;
      },
    },
  }
);

export const Org = mongoose.models.Org || mongoose.model('Org', orgSchema);
export default Org;
