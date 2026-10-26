import { z } from 'zod';

export const createPaymentSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation ID format'),
  amount: z.number().positive('Payment amount must be positive'),
  currency: z.string().default('INR'),
  paymentMethod: z.enum(['RAZORPAY_UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'NETBANKING']).default('RAZORPAY_UPI'),
});

export const webhookSchema = z.object({
  transactionId: z.string().min(1),
  paymentId: z.string().uuid(),
  status: z.enum(['CAPTURED', 'FAILED']),
  signature: z.string().min(1),
});

export default {
  createPaymentSchema,
  webhookSchema,
};

