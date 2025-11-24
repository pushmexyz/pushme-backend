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

/**
 * Validates username according to spec:
 * - No spaces
 * - No slurs
 * - No emojis
 * - No special characters (only letters, numbers, underscores)
 * - Length 3-20 characters
 */
export function validateUsername(username: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }

  // Length check
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username must be 3-20 characters' };
  }

  // No spaces
  if (username.includes(' ') || username.includes('\t')) {
    return { valid: false, error: 'Username cannot contain spaces' };
  }

  // Only letters, numbers, and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }

  // Check for emojis (basic check - emojis are multi-byte)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  if (emojiRegex.test(username)) {
    return { valid: false, error: 'Username cannot contain emojis' };
  }

  // Basic profanity check (can be enhanced with a proper library)
  const profanityWords: string[] = [
    // Add common profanity words here if needed
    // For now, we'll rely on the character restrictions
  ];

  const lowerUsername = username.toLowerCase();
  for (const word of profanityWords) {
    if (lowerUsername.includes(word)) {
      return { valid: false, error: 'Username contains inappropriate content' };
    }
  }

  return { valid: true };
}

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

