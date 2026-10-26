import { z } from 'zod';

export const bookConsultationSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID format'),
  doctorId: z.string().uuid('Invalid doctor ID format'),
  symptoms: z.string().min(5, 'Please provide description of symptoms').max(2000),
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be an ISO 8601 datetime' }),
});

export const updateConsultationStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  cancellationReason: z.string().optional(),
  clinicalNotes: z.string().optional(),
});

export const cancelConsultationSchema = z.object({
  cancellationReason: z.string().min(3, 'Cancellation reason required'),
});

export const listConsultationsSchema = z.object({
  status: z.enum(['REQUESTED', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export default {
  bookConsultationSchema,
  updateConsultationStatusSchema,
  cancelConsultationSchema,
  listConsultationsSchema,
};
