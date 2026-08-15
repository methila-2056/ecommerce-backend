import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

// Persisted audit trail. Keeps enough metadata to reconstruct "who did what,
// when, from where" for security review without storing sensitive payloads
// (no tokens, no password material, no full request bodies).
export interface IAuditLog {
  event: string;
  meta: Record<string, unknown>;
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog, Model<IAuditLog>>(
  {
    event: { type: String, required: true, index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    actorId: { type: String, default: null, index: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    // Fixed size gives an automatic write cap per minute; combined with the
    // TTL-style cleanup below this collection cannot grow unbounded.
    capped: { size: 64 * 1024 * 1024, max: 500_000 },
  },
);

// Common query pattern: events over a time window for an actor or action.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ event: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog, Model<IAuditLog>>('AuditLog', auditLogSchema);
