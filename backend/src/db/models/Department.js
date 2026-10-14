// backend/src/db/models/Department.js
import mongoose from 'mongoose';

const statsSchema = new mongoose.Schema(
  {
    n: { type: Number, default: 0, min: 0 },
    mean: { type: Number, default: 12, min: 1 },
    m2: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const departmentSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true, ref: 'Org' },
    key: { type: String, required: true, trim: true }, // 'gen', 'eye', 'pharm'
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true, minlength: 1, maxlength: 4 }, // 'G', 'E'
    defaultMin: { type: Number, default: 12, min: 1, max: 120 },
    stats: { type: statsSchema, default: () => ({ n: 0, mean: 12, m2: 0 }) },
    statsHistory: { type: [Number], default: [] },
    seq: { type: Number, default: 0 }, // atomic sequence counter for ticket numbering
    order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret.key; // Exposed id to frontend is the dept key
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes per §2.2
departmentSchema.index({ orgId: 1, key: 1 }, { unique: true });
departmentSchema.index({ orgId: 1, code: 1 }, { unique: true });

export const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);
export default Department;
