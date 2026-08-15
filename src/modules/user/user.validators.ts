import { z } from 'zod';
import { ROLES } from '../../types/roles.js';
import { USER_STATUSES } from './user.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be at most 30 characters')
    .regex(/^[+()\-\s\d]{7,20}$/, 'Invalid phone number format')
    .nullable()
    .optional(),
  preferences: z
    .object({
      language: z.string().trim().min(2).max(10).optional(),
      currency: z.string().trim().length(3).toUpperCase().optional(),
      newsletter: z.boolean().optional(),
      marketingEmails: z.boolean().optional(),
    })
    .strict()
    .optional(),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(50),
  recipient: z.string().trim().min(1, 'Recipient is required').max(100),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone is required')
    .max(30)
    .regex(/^[+()\-\s\d]+$/, 'Invalid phone number format'),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  postalCode: z.string().trim().min(1, 'Postal code is required').max(20),
  country: z.string().trim().length(2, 'Country must be a 2-letter code').toUpperCase(),
  isDefault: z.boolean().optional(),
});

export const addressParamSchema = z.object({
  id: objectIdSchema,
});

export const updateAddressSchema = addressSchema.partial();

export const deactivateAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// ---- Admin only ----

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
});

export const userParamSchema = z.object({
  id: objectIdSchema,
});

export const updateUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
});

export const updateUserRolesSchema = z.object({
  roles: z
    .array(z.enum(ROLES))
    .min(1, 'At least one role is required')
    .refine((roles) => new Set(roles).size === roles.length, 'Roles must be unique'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;
