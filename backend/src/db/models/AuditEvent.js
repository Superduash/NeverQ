// backend/src/db/models/AuditEvent.js
import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true, ref: 'Org' },
    actor: { type: String, enum: ['staff', 'admin'], required: true },
    action: { type: String, required: true }, // 'remove', 'block', 'urgent', 'reveal_phone', 'skip', 'delay'
    ticketId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'Ticket' },
    at: { type: Number, required: true }, // timestamp ms
    expireAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days TTL retention
    },
  },
  {
    timestamps: true,
  }
);

auditEventSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const AuditEvent = mongoose.models.AuditEvent || mongoose.model('AuditEvent', auditEventSchema);
export default AuditEvent;
