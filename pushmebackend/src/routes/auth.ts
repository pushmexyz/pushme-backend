import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { supabase } from '../config/supabase';
import { validateUsername } from '../utils/validator';
import { broadcastAuthEvent } from '../ws/overlaySocket';

const router = Router();

/**
 * POST /auth/wallet
 * Check if user exists by wallet public key
 * Always returns: { success: true, wallet, username, needsUsername }
 */
router.post('/wallet', async (req: Request, res: Response) => {
  try {
    const { publicKey } = req.body;

    console.info('[AUTH] Wallet connected:', publicKey);

    // Validate publicKey
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'publicKey is required' 
      });
    }

    // Validate Solana public key format
    try {
      new PublicKey(publicKey);
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid publicKey format' 
      });
    }

    // Check Supabase for user by wallet
    const { data: user, error } = await supabase
      .from('users')
      .select('username, wallet')
      .eq('wallet', publicKey)
      .maybeSingle();

    if (error) {
      console.error('[AUTH] Database error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Database error' 
      });
    }

    if (user) {
      // User exists - check if username is null or empty
      const hasUsername = user.username && user.username.trim().length > 0;
      const needsUsername = !hasUsername;

      console.info('[AUTH] User found:', user.username || 'no username');
      console.info('[AUTH] Returning auth state → needsUsername:', needsUsername);

      // If user has username, broadcast auth event
      if (hasUsername) {
        broadcastAuthEvent({
          username: user.username,
          wallet: publicKey,
        });
        console.info('[AUTH] Broadcast auth event');
      }

      // Always return consistent structure
      return res.json({
        success: true,
        wallet: publicKey,
        username: user.username || null,
        needsUsername: needsUsername,
      });
    } else {
      // User does not exist - needs username
      console.info('[AUTH] User not found, needs username');
      console.info('[AUTH] Returning auth state → needsUsername: true');

      return res.json({
        success: true,
        wallet: publicKey,
        username: null,
        needsUsername: true,
      });
    }
  } catch (error: any) {
    console.error('[AUTH] Error in /auth/wallet:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /auth/create-user
 * Create new user with username
 * Returns: { success: true, wallet, username, needsUsername: false }
 */
router.post('/create-user', async (req: Request, res: Response) => {
  try {
    const { publicKey, username } = req.body;

    console.info('[AUTH] Create user request:', { publicKey, username });

    // Validate publicKey
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'publicKey is required' 
      });
    }

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ 
        success: false,
        error: usernameValidation.error 
      });
    }

    // Validate Solana public key format
    try {
      new PublicKey(publicKey);
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid publicKey format' 
      });
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      console.warn('[AUTH] Username already taken:', username);
      return res.status(409).json({ 
        success: false,
        error: 'Username already taken' 
      });
    }

    // Check if wallet already exists
    const { data: existingWallet } = await supabase
      .from('users')
      .select('id, username')
      .eq('wallet', publicKey)
      .maybeSingle();

    if (existingWallet) {
      // Wallet exists - update username if it's null/empty
      if (!existingWallet.username || existingWallet.username.trim().length === 0) {
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ username: username })
          .eq('wallet', publicKey)
          .select()
          .single();

        if (updateError) {
          console.error('[AUTH] Database error updating username:', updateError);
          return res.status(500).json({ 
            success: false,
            error: 'Failed to update username',
            details: updateError.message 
          });
        }

        console.info('[AUTH] Username updated for existing wallet:', username);
        console.info('[AUTH] Returning auth state → needsUsername: false');

        // Broadcast auth event
        broadcastAuthEvent({
          username: username,
          wallet: publicKey,
        });
        console.info('[AUTH] Broadcast auth event');

        return res.json({
          success: true,
          wallet: publicKey,
          username: username,
          needsUsername: false,
        });
      } else {
        // Wallet exists with username - return existing user
        console.info('[AUTH] Wallet already registered with username:', existingWallet.username);
        console.info('[AUTH] Returning auth state → needsUsername: false');

        broadcastAuthEvent({
          username: existingWallet.username,
          wallet: publicKey,
        });
        console.info('[AUTH] Broadcast auth event');

        return res.json({
          success: true,
          wallet: publicKey,
          username: existingWallet.username,
          needsUsername: false,
        });
      }
    }

    // Insert new user into Supabase
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        wallet: publicKey,
        username: username,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[AUTH] Database error creating user:', insertError);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to create user',
        details: insertError.message 
      });
    }

    console.info('[AUTH] New user created:', username);
    console.info('[AUTH] Returning auth state → needsUsername: false');

    // Broadcast auth event via WebSocket
    broadcastAuthEvent({
      username: username,
      wallet: publicKey,
    });
    console.info('[AUTH] Broadcast auth event');

    // Return consistent structure
    return res.json({
      success: true,
      wallet: publicKey,
      username: newUser.username,
      needsUsername: false,
    });
  } catch (error: any) {
    console.error('[AUTH] Error in /auth/create-user:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

export default router;
