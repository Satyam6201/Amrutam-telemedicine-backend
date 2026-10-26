import { z } from 'zod';

export const doctorSearchSchema = z.object({
  specialty: z.string().optional(),
  query: z.string().optional(),
  minFee: z.coerce.number().nonnegative().optional(),
  maxFee: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  language: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateDoctorSchema = z.object({
  bio: z.string().optional(),
  consultationFee: z.number().positive().optional(),
  languages: z.array(z.string()).optional(),
  experienceYears: z.number().int().nonnegative().optional(),
});

export default {
  doctorSearchSchema,
  updateDoctorSchema,
};

