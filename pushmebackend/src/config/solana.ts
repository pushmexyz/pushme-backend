import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { config } from './env';

export const solanaConnection = new Connection(config.solana.rpcUrl, 'confirmed');

export const treasuryPublicKey = config.solana.treasuryWallet
  ? new PublicKey(config.solana.treasuryWallet)
  : null;

export async function verifyTransaction(
  txHash: string,
  expectedAmount: number,
  expectedRecipient: PublicKey,
  expectedSender?: PublicKey
): Promise<{ verified: boolean; error?: string }> {
  try {
    const tx = await solanaConnection.getTransaction(txHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found' };
    }

    // Check if transaction is confirmed
    if (!tx.meta || tx.meta.err) {
      return { verified: false, error: 'Transaction failed or not confirmed' };
    }

    // Verify recipient and amount
    const postBalances = tx.meta.postBalances;
    const preBalances = tx.meta.preBalances;
    
    // Handle both legacy and versioned transactions
    const accountKeys = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys || [];

    let recipientFound = false;
    let senderFound = false;

    for (let i = 0; i < accountKeys.length; i++) {
      const accountKey = accountKeys[i];
      if (!accountKey || !accountKey.equals) continue;

      // Check if this is the recipient
      if (accountKey.equals(expectedRecipient)) {
        const balanceChange = (postBalances[i] - preBalances[i]) / 1e9; // Convert lamports to SOL
        if (balanceChange >= expectedAmount) {
          recipientFound = true;
        } else {
          return { verified: false, error: `Insufficient amount. Expected ${expectedAmount} SOL, got ${balanceChange} SOL` };
        }
      }

      // Check if this is the sender (if provided)
      if (expectedSender && accountKey.equals(expectedSender)) {
        const balanceChange = (preBalances[i] - postBalances[i]) / 1e9;
        if (balanceChange >= expectedAmount) {
          senderFound = true;
        }
      }
    }

    if (!recipientFound) {
      return { verified: false, error: 'Transaction recipient does not match treasury wallet' };
    }

    if (expectedSender && !senderFound) {
      return { verified: false, error: 'Transaction sender does not match wallet address' };
    }

    return { verified: true };
  } catch (error: any) {
    console.error('Error verifying transaction:', error);
    return { verified: false, error: `Error verifying transaction: ${error.message}` };
  }
}

