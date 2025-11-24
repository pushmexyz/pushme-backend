import dotenv from 'dotenv';

// Load .env.local first (if exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config(); // This will override with .env if it exists

export const config = {
  port: parseInt(process.env.PORT || '5001', 10), // Default to 5001 as per spec
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    treasuryWallet: process.env.TREASURY_WALLET || '',
    treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY || '',
  },
  
  overlay: {
    secret: process.env.OVERLAY_SECRET || 'overlay1234',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'supersecret',
    expiresIn: process.env.JWT_EXPIRES || '1d',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  media: {
    maxImageWidth: parseInt(process.env.MAX_IMAGE_WIDTH || '1200', 10),
    maxGifWidth: parseInt(process.env.MAX_GIF_WIDTH || '800', 10),
    maxAudioDuration: parseInt(process.env.MAX_AUDIO_DURATION || '20', 10),
    maxVideoDuration: parseInt(process.env.MAX_VIDEO_DURATION || '20', 10),
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10),
  },
};

// Validate required environment variables
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('Warning: Supabase configuration is missing');
}

if (!config.solana.treasuryWallet) {
  console.warn('Warning: Treasury wallet is not configured');
}

