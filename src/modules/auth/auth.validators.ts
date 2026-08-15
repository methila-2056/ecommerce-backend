import { z } from 'zod';

// Shared password policy, applied everywhere a new password is accepted so the
// rules cannot drift between endpoints.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const tokenSchema = z.string().min(1, 'Token is required');

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  email: z.email('A valid email address is required'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.email('A valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resendVerificationSchema = z.object({
  email: z.email('A valid email address is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.email('A valid email address is required'),
});

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
