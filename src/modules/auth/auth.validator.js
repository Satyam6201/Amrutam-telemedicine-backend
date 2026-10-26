import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['PATIENT', 'DOCTOR']).default('PATIENT'),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid international phone format').optional(),
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),

  registrationNumber: z.string().optional(),
  qualification: z.string().optional(),
  consultationFee: z.number().positive().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6, 'MFA code must be exactly 6 digits').optional(),
});

export const mfaVerifySchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export default {
  registerSchema,
  loginSchema,
  mfaVerifySchema,
  refreshTokenSchema,
};

