import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { createUnsignedTransaction, sendSignedTransaction, validateDonationAmount } from '../services/solana';
import { validateTextContent } from '../utils/filters';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { DonationType, DONATION_PRICES } from '../types/DonationTypes';
import { broadcastDonation } from '../ws/overlaySocket';
import { ProcessedDonation } from '../types/DonationTypes';

const router = Router();

/**
 * POST /transaction/create
 * Creates an unsigned transaction for the frontend to sign
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { wallet, type, amount, content } = req.body;

    logger.info(`[TX] POST /transaction/create - wallet: ${wallet}, type: ${type}, amount: ${amount}`);

    // Validate required fields
    if (!wallet || !type || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields: wallet, type, amount' });
    }

    // Validate donation type
    const validTypes: DonationType[] = ['text', 'gif', 'image', 'audio', 'video'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid donation type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Validate amount matches expected price
    if (!validateDonationAmount(amount, type)) {
      const expectedAmount = DONATION_PRICES[type];
      return res.status(400).json({
        error: `Invalid amount. Expected ${expectedAmount} SOL for ${type} donations, got ${amount} SOL`,
      });
    }

    // Validate wallet address
    try {
      new PublicKey(wallet);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // For text donations, validate content
    if (type === 'text' && (!content || typeof content !== 'string')) {
      return res.status(400).json({ error: 'Text donations require content field' });
    }

    // Create unsigned transaction
    const { transaction } = await createUnsignedTransaction(wallet, amount, type);

    logger.info(`[TX] Unsigned transaction created successfully for ${wallet}`);

    return res.json({
      transaction,
    });
  } catch (error: any) {
    logger.error(`[TX] Error creating transaction:`, error);
    return res.status(500).json({
      error: 'Failed to create transaction',
      details: error.message,
    });
  }
});

/**
 * POST /transaction/send
 * Receives signed transaction, broadcasts it, confirms it, and processes donation
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { signed, wallet, type, amount, content, username, metadata } = req.body;

    logger.info(`[TX] POST /transaction/send - wallet: ${wallet}, type: ${type}, amount: ${amount}`);

    // Validate required fields
    if (!signed || !wallet || !type || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields: signed, wallet, type, amount' });
    }

    // Validate donation type
    const validTypes: DonationType[] = ['text', 'gif', 'image', 'audio', 'video'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid donation type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Validate amount matches expected price
    if (!validateDonationAmount(amount, type)) {
      const expectedAmount = DONATION_PRICES[type];
      return res.status(400).json({
        error: `Invalid amount. Expected ${expectedAmount} SOL for ${type} donations, got ${amount} SOL`,
      });
    }

    // Send and confirm transaction
    logger.info(`[TX] Signed transaction received`);
    const { signature, confirmed } = await sendSignedTransaction(signed);

    if (!confirmed) {
      return res.status(500).json({
        error: 'Transaction confirmation failed',
        signature,
      });
    }

    logger.info(`[TX] Transaction confirmed: ${signature}`);

    // Check for duplicate transaction hash
    const { data: existingDonation } = await supabase
      .from('donations')
      .select('id')
      .eq('tx_hash', signature)
      .maybeSingle();

    if (existingDonation) {
      logger.warn(`[TX] Duplicate transaction hash: ${signature}`);
      return res.status(409).json({
        error: 'Transaction hash already exists',
        message: 'This donation has already been processed',
        signature,
      });
    }

    // Process donation content
    let mediaUrl: string | null = null;
    let text: string | null = null;

    if (type === 'text') {
      // Validate and sanitize text
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Text donations require content field' });
      }

      const textValidation = validateTextContent(content);
      if (!textValidation.valid) {
        logger.warn(`[TX] Invalid text content`);
        return res.status(400).json({ error: textValidation.error || 'Invalid text content' });
      }

      text = textValidation.sanitized;
      logger.info(`[TX] Text donation: ${text.substring(0, 50)}...`);
    } else {
      // Handle media content
      if (content) {
        if (content.startsWith('data:')) {
          mediaUrl = content;
        } else if (content.startsWith('http')) {
          mediaUrl = content;
        } else {
          // Assume base64 string - convert to data URL
          const mimeType =
            type === 'image'
              ? 'image/png'
              : type === 'gif'
              ? 'image/gif'
              : type === 'audio'
              ? 'audio/mpeg'
              : type === 'video'
              ? 'video/mp4'
              : 'application/octet-stream';
          mediaUrl = `data:${mimeType};base64,${content}`;
        }
      }
    }

    // Get price based on type
    const price = DONATION_PRICES[type];

    // Save donation to database
    logger.info(`[TX] Saving donation to database`);
    const { data: donationData, error: dbError } = await supabase
      .from('donations')
      .insert({
        wallet,
        username: username || null,
        type,
        media_url: mediaUrl,
        text,
        price,
        tx_hash: signature,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (dbError) {
      logger.error(`[TX] Database error:`, dbError);

      // Check for duplicate transaction hash error
      if (
        dbError.code === '23505' ||
        dbError.message?.includes('duplicate') ||
        dbError.message?.includes('unique')
      ) {
        return res.status(409).json({
          error: 'Transaction hash already exists',
          message: 'This donation has already been processed',
          signature,
        });
      }

      return res.status(500).json({
        error: 'Failed to save donation',
        details: dbError.message,
        signature,
      });
    }

    logger.info(
      `[TX] ✅ Donation received: ${type} from ${username || wallet} (${price} SOL) - TX: ${signature.substring(0, 8)}...`
    );

    // Broadcast through WebSocket overlay (INSTANT update - triggers red button animation!)
    broadcastDonation({
      type,
      wallet,
      content: type === 'text' ? text || undefined : mediaUrl || undefined,
      amount: price,
      signature,
      username: username || undefined,
      donationId: donationData.id,
      createdAt: donationData.created_at,
    });

    // Return success response
    return res.json({
      success: true,
      signature,
      donation: {
        id: donationData.id,
        type: donationData.type,
        text: donationData.text,
        mediaUrl: donationData.media_url,
        username: donationData.username,
        wallet: donationData.wallet,
        price: parseFloat(donationData.price),
        tx_hash: donationData.tx_hash,
        created_at: donationData.created_at,
      },
    });
  } catch (error: any) {
    logger.error(`[TX] Error sending transaction:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

export default router;

