import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const MAX_ITEM_QUANTITY = 99;

export interface ICartItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  quantity: number;
  addedAt: Date;
}

export interface ICart {
  userId: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export type CartDocument = HydratedDocument<ICart>;

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1, max: MAX_ITEM_QUANTITY },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart, Model<ICart>>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const Cart = model<ICart, Model<ICart>>('Cart', cartSchema);
