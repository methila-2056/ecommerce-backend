import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface ICategory {
  name: string;
  slug: string;
  parent: Types.ObjectId | null;
  description: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory, Model<ICategory>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    description: { type: String, default: '', maxlength: 1000 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Unique indexes prevent duplicate categories/slugs from racing in; the
// parent index speeds up "children of X" (subcategory) lookups.
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ name: 1 }, { unique: true });

export const Category = model<ICategory, Model<ICategory>>('Category', categorySchema);
