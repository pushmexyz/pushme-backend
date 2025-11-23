import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { supabase, User } from '../config/supabase';
import { generateNonce, verifySignature } from '../utils/signature';
import { validateAuthPayload } from '../utils/validator';
import { logger } from '../utils/logger';
import { AuthToken } from '../types/AuthTypes';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Generate nonce for wallet authentication
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;

    logger.info(`[AUTH] POST /auth/nonce - wallet: ${wallet}`);

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const { nonce, timestamp, message } = generateNonce(wallet);

    logger.info(`[AUTH] Nonce generated for wallet: ${wallet}`);

    res.json({
      nonce,
      timestamp,
      message,
    });
  } catch (error) {
    logger.error('[AUTH] Error generating nonce:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify signature and create JWT
router.post('/verify', async (req: Request, res: Response) => {
  try {
    logger.info(`[AUTH] POST /auth/verify`);

    const validation = validateAuthPayload(req.body);

    if (!validation.success) {
      logger.warn(`[AUTH] Validation failed: ${validation.error}`);
      return res.status(400).json({ error: validation.error });
    }

    const { wallet, signature, nonce, timestamp } = validation.data!;

    logger.info(`[AUTH] Verifying signature for wallet: ${wallet}`);

    // 1. Verify signature (includes nonce verification)
    const isValid = verifySignature(wallet, signature, nonce, timestamp);

    if (!isValid) {
      logger.warn(`[AUTH] Invalid signature for wallet: ${wallet}`);
      return res.status(401).json({ error: 'Invalid signature or expired nonce' });
    }

    // 2. Get existing user to preserve username (if exists)
    const { data: existingUser } = await supabase
      .from('users')
      .select('username, id')
      .eq('wallet', wallet)
      .maybeSingle();

    // 3. Upsert user in Supabase (creates if new, updates if exists)
    // Preserve existing username if user already exists
    const { data: user, error: upsertError } = await supabase
      .from('users')
      .upsert(
        {
          wallet,
          username: existingUser?.username || null, // Preserve existing username
          created_at: existingUser ? undefined : new Date().toISOString(), // Only set on create
        },
        {
          onConflict: 'wallet',
        }
      )
      .select()
      .single();

    if (upsertError) {
      logger.error('[AUTH] Database error during upsert:', upsertError);
      return res.status(500).json({ 
        error: 'Failed to create or update user',
        details: upsertError.message 
      });
    }

    if (!user) {
      logger.error('[AUTH] User upsert returned no data');
      return res.status(500).json({ error: 'Failed to retrieve user after upsert' });
    }

    if (existingUser) {
      logger.info(`[AUTH] Existing user authenticated: ${user.id} (wallet: ${wallet})`);
    } else {
      logger.info(`[AUTH] New user created: ${user.id} (wallet: ${wallet})`);
    }

    // Create JWT (don't set exp manually - let jwt.sign handle it with expiresIn)
    const tokenPayload: { wallet: string } = {
      wallet,
    };

    const token = jwt.sign(tokenPayload, config.jwt.secret as string, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    logger.info(`[AUTH] User authenticated successfully: ${wallet}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        wallet: user.wallet,
        username: user.username,
      },
    });
  } catch (error) {
    logger.error('[AUTH] Error verifying signature:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user from JWT
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthToken;

      // Fetch user from database
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('wallet', decoded.wallet)
        .single();

      if (error || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`[AUTH] GET /auth/me - wallet: ${user.wallet}`);

      res.json({
        user: {
          id: user.id,
          wallet: user.wallet,
          username: user.username,
        },
      });
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    logger.error('[AUTH] Error in /me endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /auth/me - Update user profile (username)
router.patch('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthToken;
      const wallet = decoded.wallet;
      const { username } = req.body;

      logger.info(`[AUTH] Updating username for wallet: ${wallet}, username: ${username}`);

      // Validate username
      if (username && (username.length < 3 || username.length > 20)) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
      }

      if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
      }

      // Update user in database
      const { data, error } = await supabase
        .from('users')
        .update({ 
          username: username || null,
        })
        .eq('wallet', wallet)
        .select()
        .single();

      if (error) {
        logger.error(`[AUTH] Database error:`, error);
        return res.status(500).json({ error: 'Failed to update username' });
      }

      logger.info(`[AUTH] Username updated successfully`);

      res.json({
        user: {
          id: data.id,
          wallet: data.wallet,
          username: data.username,
        },
      });
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error: any) {
    logger.error(`[AUTH] Unexpected error:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

