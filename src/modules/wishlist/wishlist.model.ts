import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface IWishlistItem {
  productId: Types.ObjectId;
  addedAt: Date;
}

export interface IWishlist {
  userId: Types.ObjectId;
  items: Types.DocumentArray<IWishlistItem>;
  createdAt: Date;
  updatedAt: Date;
}

export type WishlistDocument = HydratedDocument<IWishlist>;

const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const wishlistSchema = new Schema<IWishlist, Model<IWishlist>>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const Wishlist = model<IWishlist, Model<IWishlist>>('Wishlist', wishlistSchema);
