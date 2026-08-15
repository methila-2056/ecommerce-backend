import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { ROLES, type Role } from '../../types/roles.js';

export const USER_STATUSES = ['active', 'suspended', 'deactivated'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface IAddress {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface IUserPreferences {
  language: string;
  currency: string;
  newsletter: boolean;
  marketingEmails: boolean;
}

export interface IUser {
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  roles: Role[];
  status: UserStatus;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date | null;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  addresses: Types.DocumentArray<IAddress>;
  preferences: IUserPreferences;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

// Shapes of documents as they leave the service layer (never the raw doc, so
// passwordHash cannot leak through a careless spread).
export interface UserPublic {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: Role[];
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String, required: true, trim: true, maxlength: 50 },
    recipient: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 2 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new Schema<IUser, Model<IUser>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Unique index backs fast login lookups and enforces one account per email.
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    // select:false keeps the hash out of every query unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [String], enum: ROLES, required: true, default: ['CUSTOMER'] },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    addresses: { type: [addressSchema], default: [] },
    preferences: {
      type: new Schema<IUserPreferences>({
        language: { type: String, default: 'en', maxlength: 10 },
        currency: { type: String, default: 'USD', maxlength: 3 },
        newsletter: { type: Boolean, default: false },
        marketingEmails: { type: Boolean, default: false },
      }),
      default: () => ({}),
    },
    deactivatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
  },
);

export function toUserPublic(user: UserDocument): UserPublic {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    roles: user.roles,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

export const User = model<IUser, Model<IUser>>('User', userSchema);
