import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { solanaConnection, treasuryPublicKey } from '../config/solana';
import { logger } from '../utils/logger';
import { DONATION_PRICES, DonationType } from '../types/DonationTypes';

/**
 * Creates an unsigned transaction for a donation
 */
export async function createUnsignedTransaction(
  wallet: string,
  amount: number,
  type: DonationType
): Promise<{ transaction: string; recentBlockhash: string }> {
  try {
    logger.info(`[TX] Building unsigned transaction for wallet: ${wallet}, amount: ${amount} SOL, type: ${type}`);

    if (!treasuryPublicKey) {
      throw new Error('Treasury wallet not configured');
    }

    // Convert SOL to lamports
    const lamports = Math.floor(amount * 1e9);

    // Get recent blockhash
    const recentBlockhash = await solanaConnection.getLatestBlockhash('finalized');
    logger.info(`[TX] Recent blockhash obtained: ${recentBlockhash.blockhash.substring(0, 8)}...`);

    // Build the transaction
    const tx = new Transaction({
      feePayer: new PublicKey(wallet),
      recentBlockhash: recentBlockhash.blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(wallet),
        toPubkey: treasuryPublicKey,
        lamports,
      })
    );

    // Serialize to base64
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const base64Tx = serialized.toString('base64');
    logger.info(`[TX] Unsigned transaction created successfully (${base64Tx.length} bytes)`);

    return {
      transaction: base64Tx,
      recentBlockhash: recentBlockhash.blockhash,
    };
  } catch (error: any) {
    logger.error(`[TX] Error creating unsigned transaction:`, error);
    throw new Error(`Failed to create unsigned transaction: ${error.message}`);
  }
}

/**
 * Sends a signed transaction and confirms it
 */
export async function sendSignedTransaction(
  signedTxBase64: string
): Promise<{ signature: string; confirmed: boolean }> {
  try {
    logger.info(`[TX] Signed transaction received`);

    // Deserialize the signed transaction
    const signedTxBuffer = Buffer.from(signedTxBase64, 'base64');
    const signedTx = Transaction.from(signedTxBuffer);

    logger.info(`[TX] Broadcasting transaction...`);

    // Broadcast the transaction
    const signature = await solanaConnection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    logger.info(`[TX] Transaction broadcasted with signature: ${signature}`);

    // Confirm the transaction
    logger.info(`[TX] Confirming transaction: ${signature}...`);
    const confirmation = await confirmTransaction(signature);

    if (!confirmation.confirmed) {
      throw new Error(`Transaction confirmation failed: ${confirmation.error || 'Unknown error'}`);
    }

    logger.info(`[TX] Confirmed: signature ${signature}`);

    return {
      signature,
      confirmed: true,
    };
  } catch (error: any) {
    logger.error(`[TX] Error sending signed transaction:`, error);
    throw new Error(`Failed to send transaction: ${error.message}`);
  }
}

/**
 * Confirms a transaction with finalized commitment
 */
export async function confirmTransaction(
  signature: string
): Promise<{ confirmed: boolean; error?: string }> {
  try {
    logger.info(`[TX] Confirming transaction: ${signature}...`);

    const confirmation = await solanaConnection.confirmTransaction(signature, 'finalized');

    if (confirmation.value.err) {
      logger.error(`[TX] Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      return {
        confirmed: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    logger.info(`[TX] Transaction confirmed successfully: ${signature}`);
    return { confirmed: true };
  } catch (error: any) {
    logger.error(`[TX] Error confirming transaction:`, error);
    return {
      confirmed: false,
      error: error.message,
    };
  }
}

/**
 * Validates donation amount matches expected price for type
 */
export function validateDonationAmount(amount: number, type: DonationType): boolean {
  const expectedAmount = DONATION_PRICES[type];
  // Allow small floating point differences (0.0001 SOL tolerance)
  return Math.abs(amount - expectedAmount) < 0.0001;
}

