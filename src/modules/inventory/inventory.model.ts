import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const MOVEMENT_TYPES = [
  'restock',
  'reservation',
  'release',
  'sale',
  'adjustment',
  'return',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// Every change to a stock counter is recorded as an immutable movement so the
// full inventory audit trail can be reconstructed: who changed what, when,
// why, and by how much. `quantity` is signed relative to AVAILABLE stock:
//   restock/adjustment(+):  available increases
//   reservation(-)/sale(-): available decreases
//   release(+)/return(+):   available increases (released back to sellable)
export interface IInventoryMovement {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  sku: string;
  type: MovementType;
  quantity: number;
  beforeAvailable: number | null;
  afterAvailable: number | null;
  reason: string;
  referenceType: 'order' | 'orderItem' | 'manual' | null;
  referenceId: string | null;
  actorId: string | null;
  createdAt: Date;
}

export type InventoryMovementDocument = HydratedDocument<IInventoryMovement>;

const inventoryMovementSchema = new Schema<IInventoryMovement, Model<IInventoryMovement>>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    quantity: { type: Number, required: true },
    beforeAvailable: { type: Number, default: null },
    afterAvailable: { type: Number, default: null },
    reason: { type: String, default: '', maxlength: 500 },
    referenceType: { type: String, enum: ['order', 'orderItem', 'manual'], default: null },
    referenceId: { type: String, default: null, index: true },
    actorId: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Common query patterns: stock history for one variant, and audit by order.
inventoryMovementSchema.index({ productId: 1, variantId: 1, createdAt: -1 });
inventoryMovementSchema.index({ createdAt: -1 });

export const InventoryMovement = model<IInventoryMovement, Model<IInventoryMovement>>(
  'InventoryMovement',
  inventoryMovementSchema,
);
