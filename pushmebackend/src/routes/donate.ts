import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { supabase } from '../config/supabase';
import { validateDonationPayload } from '../utils/validator';
import { verifyPayment } from '../services/paymentService';
import { processMedia, uploadProcessedMedia } from '../services/mediaService';
import { validateTextContent } from '../utils/filters';
import { addDonationToQueue } from '../queues/donationQueue';
import { addMediaToQueue } from '../queues/mediaQueue';
import { emitDonationEvent, emitFilterRejectedMedia } from '../services/overlayEventService';
import { logger } from '../utils/logger';
import { AuthToken } from '../types/AuthTypes';
import { ProcessedDonation, DONATION_PRICES } from '../types/DonationTypes';
import { DonationPayload } from '../types/DonationTypes';

const router = Router();

// Middleware to verify JWT
function verifyJWT(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthToken;
    (req as any).wallet = decoded.wallet;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Main donation endpoint
router.post('/', verifyJWT, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet;
    const { type, content, username, txHash, metadata } = req.body;

    logger.info(`[DONATE] POST /donate - type: ${type}, wallet: ${wallet}, txHash: ${txHash}`);

    // Validate payload
    const validation = validateDonationPayload(req.body);

    if (!validation.success) {
      logger.warn(`[DONATE] Validation failed: ${validation.error}`);
      return res.status(400).json({ error: validation.error });
    }

    const payload: DonationPayload = validation.data!;

    // Verify wallet matches token
    if (payload.wallet !== wallet) {
      logger.warn(`[DONATE] Wallet mismatch - expected: ${wallet}, got: ${payload.wallet}`);
      return res.status(403).json({ error: 'Wallet mismatch' });
    }

    // Check for duplicate transaction hash
    logger.info(`[DONATE] Checking for duplicate transaction: ${txHash}`);
    const { data: existingDonation } = await supabase
      .from('donations')
      .select('id')
      .eq('tx_hash', txHash)
      .maybeSingle();

    if (existingDonation) {
      logger.warn(`[DONATE] Duplicate transaction hash: ${txHash}`);
      return res.status(409).json({
        error: 'Transaction hash already exists',
        message: 'This donation has already been processed',
      });
    }

    // Verify payment
    logger.info(`[DONATE] Verifying payment for txHash: ${txHash}`);
    const paymentVerification = await verifyPayment(payload.txHash, payload.type, wallet);

    if (!paymentVerification.verified) {
      logger.warn(`[DONATE] Payment verification failed for txHash: ${txHash}`);
      return res.status(403).json({
        error: paymentVerification.error || 'Payment verification failed',
        requiredAmount: DONATION_PRICES[payload.type],
      });
    }

    logger.info(`[DONATE] Payment verified successfully`);

    let mediaUrl: string | null = null;
    let text: string | null = null;

    // Process based on donation type
    if (payload.type === 'text') {
      // Validate and sanitize text
      const textValidation = validateTextContent(payload.content);

      if (!textValidation.valid) {
        logger.warn(`[DONATE] Invalid text content`);
        return res.status(400).json({ error: textValidation.error || 'Invalid text content' });
      }

      text = textValidation.sanitized;
      logger.info(`[DONATE] Text donation: ${text.substring(0, 50)}...`);
    } else {
      // For MVP: Store base64 content directly (media_url will be the base64 data URL)
      // For production: Process and upload to storage
      logger.info(`[DONATE] Processing ${payload.type} media`);
      
      if (payload.content.startsWith('data:')) {
        // Base64 data URL - store as-is for MVP
        mediaUrl = payload.content;
        logger.info(`[DONATE] Media stored as base64 data URL`);
      } else if (payload.content.startsWith('http')) {
        // URL - store as-is
        mediaUrl = payload.content;
        logger.info(`[DONATE] Media stored as URL: ${mediaUrl}`);
      } else {
        // Assume base64 string - convert to data URL
        // Try to detect MIME type from content or use default
        const mimeType = payload.type === 'image' ? 'image/png' :
                        payload.type === 'gif' ? 'image/gif' :
                        payload.type === 'audio' ? 'audio/mpeg' :
                        payload.type === 'video' ? 'video/mp4' : 'application/octet-stream';
        mediaUrl = `data:${mimeType};base64,${payload.content}`;
        logger.info(`[DONATE] Media stored as base64 with MIME type: ${mimeType}`);
      }
    }

    // Get price based on type
    const price = paymentVerification.amount || DONATION_PRICES[payload.type];

    // Save donation to database directly (in addition to queue)
    logger.info(`[DONATE] Saving donation to database`);
    const { data: donationData, error: dbError } = await supabase
      .from('donations')
      .insert({
        wallet,
        username: username || null,
        type: payload.type,
        media_url: mediaUrl,
        text: text,
        price: price,
        tx_hash: txHash,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (dbError) {
      logger.error(`[DONATE] Database error:`, dbError);
      
      // Check for duplicate transaction hash error
      if (dbError.code === '23505' || dbError.message?.includes('duplicate') || dbError.message?.includes('unique')) {
        return res.status(409).json({
          error: 'Transaction hash already exists',
          message: 'This donation has already been processed',
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to save donation',
        details: dbError.message 
      });
    }

    logger.info(`[DONATE] ✅ Donation received: ${payload.type} from ${payload.username || wallet} (${price} SOL) - TX: ${txHash.substring(0, 8)}...`);

    // Also add to donation queue for async processing (optional)
    const processedDonation: ProcessedDonation = {
      type: payload.type,
      text,
      mediaUrl,
      username: payload.username,
      wallet,
      txHash: payload.txHash,
      price,
      metadata: payload.metadata,
    };
    await addDonationToQueue(processedDonation);

    // Emit WebSocket event to overlay (INSTANT update - no polling needed!)
    emitDonationEvent(processedDonation, donationData.id, donationData.created_at);

    // Return donation with all fields as specified
    res.json({
      success: true,
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
    logger.error(`[DONATE] Unexpected error:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

export default router;

