import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { solanaConnection, treasuryPublicKey } from '../config/solana';

/**
 * Creates an unsigned transaction for a donation
 * Sends amount SOL to treasury wallet
 */
export async function createUnsignedTransaction(
  wallet: string,
  amount: number
): Promise<{ transaction: string }> {
  try {
    // Logging handled in route

    if (!treasuryPublicKey) {
      throw new Error('Treasury wallet not configured');
    }

    // Convert SOL to lamports
    const lamports = Math.floor(amount * 1e9);

    // Get recent blockhash
    const recentBlockhash = await solanaConnection.getLatestBlockhash('finalized');

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

    return {
      transaction: base64Tx,
    };
  } catch (error: any) {
    console.error('[DONATION] Error creating unsigned transaction:', error);
    throw new Error(`Failed to create unsigned transaction: ${error.message}`);
  }
}

/**
 * Sends a signed transaction and confirms it
 * Implements retry logic (3 attempts)
 */
export async function sendSignedTransaction(
  signedTxBase64: string
): Promise<{ signature: string; confirmed: boolean }> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Deserialize the signed transaction (base64 → buffer)
      const signedTxBuffer = Buffer.from(signedTxBase64, 'base64');
      const signedTx = Transaction.from(signedTxBuffer);

      // Broadcast the transaction (sendRawTransaction)
      const signature = await solanaConnection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirm the transaction (confirmTransaction)
      const confirmation = await confirmTransactionWithRetry(signature);

      if (confirmation.confirmed) {
        return {
          signature,
          confirmed: true,
        };
      } else {
        throw new Error(confirmation.error || 'Transaction confirmation failed');
      }
    } catch (error: any) {
      lastError = error;
      
      // Log structured error summary (not full stack trace)
      const errorMsg = error.message || String(error);
      console.error(`[DONATION] Transaction attempt ${attempt} failed:`, errorMsg);
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // All retries failed - preserve error for proper handling in route
  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Confirms a transaction with retry logic
 */
async function confirmTransactionWithRetry(
  signature: string,
  maxAttempts: number = 10
): Promise<{ confirmed: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const confirmation = await solanaConnection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        return {
          confirmed: false,
          error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        };
      }

      return { confirmed: true };
    } catch (error: any) {
      if (attempt === maxAttempts) {
        return {
          confirmed: false,
          error: error.message,
        };
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return {
    confirmed: false,
    error: 'Transaction confirmation timeout',
  };
}

