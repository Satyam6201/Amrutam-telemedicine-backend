import { z } from 'zod';

export const issuePrescriptionSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation ID format'),
  diagnosis: z.string().min(3, 'Diagnosis description is required'),
  medications: z
    .array(
      z.object({
        name: z.string().min(1, 'Medication name is required'),
        dosage: z.string().min(1, 'Dosage is required (e.g., 500mg, 1 tablet, 10ml)'),
        frequency: z.string().min(1, 'Frequency is required (e.g., Once daily, Twice daily)'),
        durationDays: z.number().int().positive('Duration must be positive integer days'),
        instructions: z.string().optional(),
      })
    )
    .min(1, 'Prescription must contain at least one medication'),
  advice: z.string().optional(),
  followUpDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpDate must be in YYYY-MM-DD format')
    .optional(),
});

export default {
  issuePrescriptionSchema,
};
