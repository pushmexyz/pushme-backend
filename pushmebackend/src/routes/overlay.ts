import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

const router = Router();

// GET /overlay/recent - Get recent donations (fallback for initial load, WebSocket is primary)
router.get('/recent', async (req: Request, res: Response) => {
  try {
    // Validate and parse limit parameter
    let limit = parseInt(req.query.limit as string) || 1;
    
    // Enforce max limit
    if (limit > 100) {
      limit = 100;
    }
    
    // Ensure minimum limit
    if (limit < 1) {
      limit = 1;
    }
    
    // Reduced logging - only log errors, not every poll request
    
    // Use Supabase client directly (NOT fetch)
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`[OVERLAY] Error fetching recent donations:`, {
        code: error.code,
        message: error.message,
      });
      return res.status(500).json({ 
        error: 'Failed to fetch donations',
        details: error.message,
      });
    }

    // Transform data to match frontend expectations
    const donations = (data || []).map((donation: any) => ({
      id: donation.id,
      type: donation.type,
      text: donation.text,
      media_url: donation.media_url,
      username: donation.username,
      wallet: donation.wallet,
      price: parseFloat(donation.price),
      tx_hash: donation.tx_hash,
      created_at: donation.created_at,
    }));

    // No logging for successful polls - reduces console spam
    res.json({ donations });
  } catch (error: any) {
    logger.error(`[OVERLAY] Unexpected error in /overlay/recent:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// GET /overlay/health - Health check
router.get('/health', (req: Request, res: Response) => {
  // No logging for health checks - reduces noise
  res.json({ 
    status: 'ok',
    timestamp: Date.now() 
  });
});

// GET /overlay/test-db - Test database connection
router.get('/test-db', async (req: Request, res: Response) => {
  try {
    logger.info('[OVERLAY] Testing database connection');
    
    // Test Supabase connection by querying donations table
    const { data, error, count } = await supabase
      .from('donations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('[OVERLAY] Database test failed:', error);
      return res.status(500).json({
        status: 'error',
        error: 'Database connection failed',
        details: error.message,
        code: error.code,
      });
    }

    logger.info('[OVERLAY] Database connection successful');
    res.json({
      status: 'ok',
      message: 'Database connection successful',
      donationsCount: count || 0,
    });
  } catch (error: any) {
    logger.error('[OVERLAY] Database test error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Database test failed',
      details: error.message,
    });
  }
});

export default router;

