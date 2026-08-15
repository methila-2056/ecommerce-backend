import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface IBrand {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type BrandDocument = HydratedDocument<IBrand>;

const brandSchema = new Schema<IBrand, Model<IBrand>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

brandSchema.index({ slug: 1 }, { unique: true });
brandSchema.index({ name: 1 }, { unique: true });

export const Brand = model<IBrand, Model<IBrand>>('Brand', brandSchema);
