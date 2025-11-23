import { createClient } from '@supabase/supabase-js';
import { config } from './env';
import { logger } from '../utils/logger';

// Validate Supabase configuration
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  logger.error('[SUPABASE] Missing Supabase configuration! Check your .env file.');
  logger.error('[SUPABASE] Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
);

// Database types
export interface User {
  id: string;
  wallet: string;
  username: string | null;
  created_at: string;
  updated_at?: string; // Optional - may not exist in all schemas
}

export interface Donation {
  id: string;
  wallet: string;
  username: string;
  type: 'text' | 'gif' | 'image' | 'audio' | 'video';
  media_url: string | null;
  text: string | null;
  price: number;
  tx_hash: string;
  created_at: string;
}

