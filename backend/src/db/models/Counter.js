// backend/src/db/models/Counter.js
import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // 'c1', 'c2', 'ctr-xyz'
    orgId: { type: String, required: true, ref: 'Org' },
    deptKey: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    state: { type: String, enum: ['open', 'paused', 'closed'], default: 'open' },
    currentTicketId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'Ticket' },
    delayUntil: { type: Number, default: null }, // demo-clock epoch ms
    delayReason: { type: String, default: null },
    resumeAt: { type: Number, default: null },
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

// Indexes per §2.2
counterSchema.index({ orgId: 1, deptKey: 1 });
counterSchema.index({ currentTicketId: 1 }, { sparse: true });

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
export default Counter;
