import { PublicKey } from '@solana/web3.js';
import { verifyTransaction, treasuryPublicKey } from '../config/solana';
import { DONATION_PRICES, DonationType } from '../types/DonationTypes';
import { logger } from '../utils/logger';

export async function verifyPayment(
  txHash: string,
  donationType: DonationType,
  wallet: string
): Promise<{ verified: boolean; amount?: number; error?: string }> {
  try {
    if (!treasuryPublicKey) {
      logger.error('[PAYMENT] Treasury wallet not configured');
      return { verified: false, error: 'Treasury wallet not configured' };
    }

    const expectedAmount = DONATION_PRICES[donationType];
    const expectedRecipient = treasuryPublicKey;
    const expectedSender = new PublicKey(wallet);

    logger.info(`[PAYMENT] Verifying transaction: ${txHash}`);
    logger.info(`[PAYMENT] Expected amount: ${expectedAmount} SOL`);
    logger.info(`[PAYMENT] Expected recipient: ${expectedRecipient.toBase58()}`);
    logger.info(`[PAYMENT] Expected sender: ${expectedSender.toBase58()}`);

    const verification = await verifyTransaction(txHash, expectedAmount, expectedRecipient, expectedSender);

    if (!verification.verified) {
      logger.warn(`[PAYMENT] Payment verification failed for tx: ${txHash}, wallet: ${wallet}`);
      logger.warn(`[PAYMENT] Error: ${verification.error}`);
      return {
        verified: false,
        error: verification.error || 'Transaction verification failed. Please ensure payment meets minimum amount.',
      };
    }

    logger.info(`[PAYMENT] Payment verified successfully for tx: ${txHash}, amount: ${expectedAmount} SOL`);
    return { verified: true, amount: expectedAmount };
  } catch (error: any) {
    logger.error('[PAYMENT] Error verifying payment:', error);
    return { verified: false, error: `Error verifying payment: ${error.message}` };
  }
}

export function getMinimumPrice(donationType: DonationType): number {
  return DONATION_PRICES[donationType];
}

