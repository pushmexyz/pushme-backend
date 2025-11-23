import { z } from 'zod';
import { DonationType } from '../types/DonationTypes';

export const donationPayloadSchema = z.object({
  type: z.enum(['text', 'gif', 'image', 'audio', 'video']),
  content: z.string().min(1),
  username: z.string().min(1).max(50),
  wallet: z.string().min(32).max(44),
  txHash: z.string().min(64).max(128),
  metadata: z
    .object({
      duration: z.number().positive().optional(),
      size: z.number().positive().optional(),
      filetype: z.string().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    })
    .optional(),
});

export const authVerifySchema = z.object({
  wallet: z.string().min(32).max(44),
  signature: z.string().min(1),
  nonce: z.string().min(1),
  timestamp: z.number().positive(),
});

export function validateDonationPayload(data: unknown): {
  success: boolean;
  data?: z.infer<typeof donationPayloadSchema>;
  error?: string;
} {
  try {
    const validated = donationPayloadSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}

export function validateAuthPayload(data: unknown): {
  success: boolean;
  data?: z.infer<typeof authVerifySchema>;
  error?: string;
} {
  try {
    const validated = authVerifySchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}

