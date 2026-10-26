import { z } from 'zod';

export const getSlotsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  status: z.enum(['AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED']).optional(),
});

export const holdSlotSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID format'),
});

export const releaseSlotSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID format'),
});

export const bulkCreateSlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  slots: z
    .array(
      z.object({
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format HH:MM or HH:MM:SS'),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format HH:MM or HH:MM:SS'),
      })
    )
    .min(1, 'At least one slot must be provided'),
});

export default {
  getSlotsSchema,
  holdSlotSchema,
  releaseSlotSchema,
  bulkCreateSlotsSchema,
};

