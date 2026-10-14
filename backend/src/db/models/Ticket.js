// backend/src/db/models/Ticket.js
import mongoose from 'mongoose';

const etaSchema = new mongoose.Schema(
  {
    low: { type: Number, default: null },
    mid: { type: Number, default: null },
    high: { type: Number, default: null },
    startMs: { type: Number, default: null },
    noCounter: { type: Boolean, default: false },
  },
  { _id: false }
);

const changeItemSchema = new mongoose.Schema(
  {
    minutes: { type: Number, required: true },
    text: { type: String, required: true },
    time: { type: Number, required: true },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true, ref: 'Org' },
    deptKey: { type: String, required: true },
    token: { type: String, required: true }, // 22 chars base64url, unique index defined below
    label: { type: String, required: true }, // e.g. G-015, URG-003
    name: { type: String, default: 'Anonymous Patient', trim: true },
    phone: { type: String, default: '', trim: true }, // e.g. '+919876543210' or ''
    phoneKey: { type: String, default: null },
    deviceId: { type: String, default: null },
    source: {
      type: String,
      enum: ['remote', 'walkin', 'urgent', 'sim'],
      default: 'remote',
    },
    simulated: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ['none', 'senior', 'pregnant', 'disabled'],
      default: 'none',
    },
    urgent: { type: Boolean, default: false },
    urgentAt: { type: Number, default: null },
    urgentReason: { type: String, default: null },
    status: {
      type: String,
      enum: ['waiting', 'called', 'serving', 'done', 'cancelled', 'expired', 'removed'],
      default: 'waiting',
    },
    // Set to true while waiting/called/serving; unset ($unset) on terminal status to free unique index
    active: { type: Boolean },
    arrived: { type: Boolean, default: false },
    arrivedAt: { type: Number, default: null },
    arrivedVia: { type: String, enum: ['gps', 'staff', 'walkin', null], default: null },
    lateCount: { type: Number, default: 0, min: 0, max: 2 },
    requeuedAt: { type: Number, default: null },
    joinedAt: { type: Number, required: true }, // demo-clock epoch ms
    sortKey: { type: Number, default: 0 },
    calledAt: { type: Number, default: null },
    startedAt: { type: Number, default: null },
    doneAt: { type: Number, default: null },
    counterId: { type: String, default: null },
    calledCounterName: { type: String, default: null },
    arriveDeadline: { type: Number, default: null },
    expiredReason: { type: String, enum: ['no_show', 'grace', 'staff', null], default: null },
    firstEta: { type: etaSchema, default: null },
    lastEta: { type: etaSchema, default: null },
    lastEtaStartMs: { type: Number, default: null },
    changes: { type: [changeItemSchema], default: [] },
    // Real-time 24h data expiry (NeverQ2 §3.8)
    expireAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 3600 * 1000),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

ticketSchema.pre('save', function () {
  if (['done', 'cancelled', 'expired', 'removed'].includes(this.status)) {
    this.active = undefined;
  }
});

// ───────────── Explicit Indexes per §2.2 ─────────────
// 1. Public token lookup (declared unique on field, indexed here as well)
ticketSchema.index({ token: 1 }, { unique: true });

// 2. TTL index: automatically purges records after 24h
ticketSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// 3. Queue ordering query
ticketSchema.index({ orgId: 1, deptKey: 1, status: 1, sortKey: 1 });

// 4. One active remote ticket per phone per hospital
ticketSchema.index(
  { orgId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true, source: 'remote' },
  }
);

// 5. One active remote ticket per device per hospital
ticketSchema.index(
  { orgId: 1, deviceId: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true, source: 'remote', deviceId: { $type: 'string', $gt: '' } },
  }
);

// 6. Cooldown lookup
ticketSchema.index({ phone: 1, status: 1, doneAt: 1 });

export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
export default Ticket;
