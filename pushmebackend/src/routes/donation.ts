import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { supabase } from '../config/supabase';
import { createUnsignedTransaction, sendSignedTransaction } from '../services/solana';
import { validateTextContent } from '../utils/filters';
import { broadcastDonationEvent } from '../ws/overlaySocket';

const router = Router();

const MIN_DONATION_AMOUNT = 0.001; // Minimum 0.001 SOL

/**
 * Detect media type from URL or content
 */
function detectMediaType(mediaUrl: string | null | undefined): 'text' | 'image' | 'gif' | 'audio' | 'video' {
  if (!mediaUrl) {
    return 'text';
  }

  const url = mediaUrl.toLowerCase();
  
  if (url.includes('gif') || url.endsWith('.gif')) {
    return 'gif';
  } else if (url.includes('image') || url.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return 'image';
  } else if (url.includes('audio') || url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    return 'audio';
  } else if (url.includes('video') || url.match(/\.(mp4|webm|mov|avi)$/i)) {
    return 'video';
  }
  
  return 'text';
}

/**
 * POST /donation/start
 * Build unsigned Solana transaction sending amount to TREASURY_WALLET
 * Input: { wallet, amount, message, mediaUrl }
 * Returns: { success: true, unsignedTx: <base64> }
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { wallet, amount, message, mediaUrl } = req.body;

    console.info('[DONATION] Start:', { wallet, amount });

    // Validate required fields
    if (!wallet || amount === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'wallet and amount are required' 
      });
    }

    // Validate amount
    if (typeof amount !== 'number' || amount < MIN_DONATION_AMOUNT) {
      return res.status(400).json({ 
        success: false,
        error: `Amount must be at least ${MIN_DONATION_AMOUNT} SOL` 
      });
    }

    // Validate wallet (Solana public key format)
    try {
      new PublicKey(wallet);
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid wallet format' 
      });
    }

    // Build unsigned transaction
    const { transaction } = await createUnsignedTransaction(wallet, amount);

    console.info('[DONATION] Unsigned transaction created');

    return res.json({
      success: true,
      unsignedTx: transaction,
    });
  } catch (error: any) {
    console.error('[DONATION] Error in /donation/start:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create transaction'
    });
  }
});

/**
 * POST /donation/confirm
 * Confirm transaction and broadcast overlay event
 * Input: { wallet, signedTx, amount, message, mediaUrl }
 * Returns: { success: true, txSignature } or error JSON
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { wallet, signedTx, amount, message, mediaUrl } = req.body;

    console.info('[DONATION] Confirm request:', { wallet, amount });

    // Validate required fields
    if (!signedTx || !wallet || amount === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'signedTx, wallet, and amount are required' 
      });
    }

    // Validate amount
    if (typeof amount !== 'number' || amount < MIN_DONATION_AMOUNT) {
      return res.status(400).json({ 
        success: false,
        error: `Amount must be at least ${MIN_DONATION_AMOUNT} SOL` 
      });
    }

    // Validate wallet (Solana public key format)
    try {
      new PublicKey(wallet);
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid wallet format' 
      });
    }

    // Decode signedTx (base64 → buffer) and send transaction
    console.info('[DONATION] Signed tx received');
    
    let txSignature: string;
    try {
      const result = await sendSignedTransaction(signedTx);
      txSignature = result.signature;
    } catch (error: any) {
      // Handle transaction errors with proper error detection
      const errorMessage = error.message || String(error);
      const errorString = JSON.stringify(error);

      // Check for insufficient funds
      if (
        errorMessage.includes('insufficient') ||
        errorString.includes('insufficient') ||
        (error.logs && error.logs.some((log: string) => log.includes('insufficient'))) ||
        (error.transactionLogs && error.transactionLogs.some((log: string) => log.includes('insufficient')))
      ) {
        console.error('[DONATION] Transaction failed: insufficient funds');
        return res.json({
          success: false,
          error: 'INSUFFICIENT_FUNDS',
          message: 'You don\'t have enough balance to complete this donation.',
        });
      }

      // Handle other transaction failures
      console.error('[DONATION] Transaction failed:', errorMessage);
      return res.json({
        success: false,
        error: 'TRANSACTION_FAILED',
        message: 'Transaction failed — please try again.',
      });
    }

    console.info('[DONATION] Tx confirmed:', txSignature);

    // Check for duplicate transaction
    const { data: existingDonation } = await supabase
      .from('donations')
      .select('id')
      .eq('tx_hash', txSignature)
      .maybeSingle();

    if (existingDonation) {
      console.warn('[DONATION] Duplicate transaction:', txSignature);
      return res.status(409).json({ 
        success: false,
        error: 'Transaction already processed' 
      });
    }

    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('username')
      .eq('wallet', wallet)
      .maybeSingle();

    const username = user?.username || wallet;

    // Sanitize message if provided
    let sanitizedText: string | null = null;
    if (message && typeof message === 'string') {
      const textValidation = validateTextContent(message);
      if (textValidation.valid) {
        sanitizedText = textValidation.sanitized;
      }
    }

    // Detect media type
    const mediaType = detectMediaType(mediaUrl);

    // Save donation to Supabase (wallet, username, message, mediaUrl, amount, txSignature)
    const { data: donationData, error: dbError } = await supabase
      .from('donations')
      .insert({
        wallet: wallet,
        username: username,
        type: mediaType,
        text: sanitizedText,
        media_url: mediaUrl || null,
        price: amount,
        tx_hash: txSignature,
        metadata: {},
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('[DONATION] Database error:', dbError.message);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to save donation'
      });
    }

    console.info('[DONATION] Supabase row saved');

    // Broadcast through WebSocket ONLY after transaction is confirmed and saved
    broadcastDonationEvent({
      type: 'donation',
      wallet: wallet,
      username: username,
      amount: amount,
      message: sanitizedText,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType,
      txHash: txSignature,
      timestamp: Date.now(),
    });

    console.info('[OVERLAY] Broadcasting donation event');

    return res.json({
      success: true,
      txSignature: txSignature,
    });
  } catch (error: any) {
    console.error('[DONATION] Error in /donation/confirm:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /donation/recent
 * Get recent donations for history UI
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const maxLimit = Math.min(limit, 100); // Cap at 100

    const { data: donations, error } = await supabase
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(maxLimit);

    if (error) {
      console.error('[DONATION] Error fetching recent:', error.message);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch donations'
      });
    }

    // Transform to match frontend expectations
    const formattedDonations = (donations || []).map((donation: any) => ({
      id: donation.id,
      username: donation.username,
      wallet: donation.wallet,
      amount: parseFloat(donation.price || 0),
      message: donation.text || null,
      mediaUrl: donation.media_url,
      txSignature: donation.tx_hash,
      createdAt: donation.created_at,
    }));

    return res.json({
      success: true,
      donations: formattedDonations,
    });
  } catch (error: any) {
    console.error('[DONATION] Error in /donation/recent:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

export default router;
